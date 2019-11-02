import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Component, ComponentConstructor } from './component';
import { ComponentEntry, Entity } from './entity';
import { Hashable, HashTable } from './hashtable';
import { JsonObject } from './types';
import { setIntersect } from './utils';

export * from './component';

type Ctor<C> = new (...args: any[]) => C;
type CtorsOf<T> = { [K in keyof T]: Ctor<T[K]> };

export type EntityId = number;

export interface ComponentChange<T_Component extends Component> {
  id: EntityId;
  e?: Entity;
  c?: T_Component;
}

export interface ComponentIndexingInfo {
  uniqueComponentValues: number;
  totalComponents: number;
}

export interface ECSData {
  indexed: string[];
  entities: {
    [entityId: string]: JsonObject;
  };
}

/** Create, monitor, iterate and manage entities comprised of components
 */
export class EntityManager {
  private currId!: EntityId;
  private entities!: { [id: number]: Entity };
  private entityNameMapping!: { [name: string]: EntityId };
  private componentEntities!: Map<ComponentConstructor, Set<EntityId>>;
  private componentValueEntities!: Map<
    ComponentConstructor,
    HashTable<Hashable>
  >;
  private entityRegistrations!: Map<number, Subject<Entity | null>>;
  private componentRegistrations!: Map<ComponentConstructor, Subject<any>>;

  constructor() {
    this.init();
  }

  private init(): void {
    this.currId = 0;
    this.entities = {};
    this.entityNameMapping = {};
    this.componentEntities = new Map<ComponentConstructor, Set<EntityId>>();
    this.componentValueEntities = new Map<
      ComponentConstructor,
      HashTable<Hashable>
    >();
    this.entityRegistrations = new Map<number, Subject<Entity | null>>();
    this.componentRegistrations = new Map<ComponentConstructor, Subject<any>>();
  }

  /** Create a new entity
   *
   * @param components - Components to add to the new entity
   * @return the new entity
   *
   */
  createEntity(...components: Component[]): Entity {
    const id = this.currId++;
    return this._createEntity(id, ...components);
  }

  /** Create a new named entity
   *
   * @param name - Name for the entity (used for later retrieval)
   * @param components - Components to add to the new entity
   *
   * @return the new entity
   */
  createNamedEntity(name: string, ...components: Component[]): Entity {
    if (name in this.entityNameMapping) {
      throw new Error(`Entity with name: ${name} already exists!`);
    }
    const newEntity = this.createEntity(...components);
    this.setEntityName(newEntity.id, name);
    return newEntity;
  }

  /** Set the name for a given entity
   *
   * @param id - The Id of the entity for the name to be attached to
   * @param name - The Name for the entity
   */
  setEntityName(id: EntityId, name: string) {
    this.checkEntity(id);
    this.entityNameMapping[name] = id;
  }

  /** Get an existing entity by its id
   *
   * @param id - ID of the entity to retrieve
   *
   * @throws {Error} If entity with id doesn't exist
   */
  get(id: EntityId): Entity | never {
    if (!this.exists(id)) {
      throw Error(`Entity with id: ${id} doesn't exist`);
    } else {
      return this.entities[id];
    }
  }

  /** Get an existing entity by its name
   *
   * @param name - Name of the entity to retrieve
   *
   * @throws {Error} If entity with specified name doesn't exist
   *
   * @see createNamedEntity - Not all entities have a name, they must have one specified by
   */
  getNamed(name: string): Entity | never {
    const id = this.entityNameMapping[name];
    if (id === undefined) {
      throw new Error(`Entity with name: ${name} doesn't exist`);
    }
    try {
      return this.get(id);
    } catch {
      throw new Error(
        `Named entity points at entity with id: ${id}, which doesn't exist!`
      );
    }
  }

  /** Remove an existing entity by ID
   *
   * @param id - Id of the entity to remove
   */
  remove(id: EntityId): boolean {
    if (!this.exists(id)) {
      return false;
    }
    let components = this.entities[id].allComponents();

    delete this.entities[id];
    for (const idIndex of this.componentEntities.values()) {
      idIndex.delete(id);
    }

    for (const componentEntry of components) {
      this.housekeepRemoveComponent(id, componentEntry.component, true);
    }

    return true;
  }

  /** Remove an existing entity by its name
   *
   * @param name - Name of the entity to remove
   *
   * @see createNamedEntity - Not all entities have a name, they must have one specified by
   */
  removeNamed(name: string): boolean {
    const id = this.entityNameMapping[name];
    if (id === undefined) {
      return false;
    } else {
      return this.remove(id);
    }
  }

  /** Set up the given Component type to be indexed for retrieval by component value
   *
   * The component type specified must have its hash() function implemented to return a unique value for each possible
   * component value e.g. if your type is a 2D coord then the hash function could return '{x, y}' and satisfy this
   * requirement.
   *
   * The utility of this is that once a component is set up for indexing you can use the supporting methods in this
   * class to retrieve all entities that have a specific component value amongst other things.
   *
   * @param componentType - Component type to set up for indexing
   *
   * @returns - The Total number of components indexed and the total number of unique components
   */
  indexBy(componentType: ComponentConstructor): ComponentIndexingInfo {
    const valueIndex = new HashTable<Hashable>();

    let count = 0;
    let typeEntities = this.componentEntities.get(componentType);
    if (typeEntities) {
      for (const id of typeEntities) {
        const component = this.entities[id].component(componentType);
        valueIndex.add(component, id);
        ++count;
      }
    }
    this.componentValueEntities.set(componentType, valueIndex);
    return {
      uniqueComponentValues: valueIndex.countKeys(),
      totalComponents: count
    };
  }

  /** Checks whether an entity has a given component value
   *
   * @throws {Error} - If the type of the component provided hasn't been set up for indexing
   * @returns {boolean} - True if the entity has a component with the provided value, false otherwise
   */
  hasIndex<T extends Component>(entityId: EntityId, component: T): boolean {
    const typeEntities = this.indexedEntitiesForType(component);
    return typeEntities.hasValue(component, entityId);
  }

  /** Gives the number of entities that have a component that matches the provided component value
   *
   * @param component - The component value to look for
   *
   * @return - The number of entities that have a component matching the one specified
   */
  countIndex<T extends Component>(component: T): number {
    return this.matchingIndex(component).length;
  }

  /** Gives all entities that have a component that matches the provided component value
   *
   * @param component - The component value to look for
   *
   * @return - An array of the entities that have the provided component value
   */
  matchingIndex<T extends Component>(component: T): Entity[] {
    const typeEntities = this.indexedEntitiesForType(component);
    return typeEntities.get(component).map((id: EntityId) => this.entities[id]);
  }

  /** Checks whether an entity with the provided ID exists
   *
   * @returns - true if an entity with the ID exists, false otherwise
   */
  exists(id: number): boolean {
    return id in this.entities;
  }

  /** Gets all entities that have a set of component types
   *
   * @param types - Component types that must exist on returned entities
   *
   * @returns - All entities that have instances of the component types passed in
   */
  matching(...types: ComponentConstructor[]): Entity[] {
    return this.matchingIds(...types).map((id: EntityId) => this.entities[id]);
  }

  /** Iterate and execute the callback on all entities that have a specified set of components
   *
   * @param callback - Callback executed for each matching entity, receives the entity and each matching component
   * @param types - Component types that determine that the callback is executed if an entity has instances of them
   *
   * @note - Order of component types in 'types' and 'callback' parameters must match. Type errors will guide correctness.
   */
  each<T extends Component[]>(
    callback: (e: Entity, ...component: T) => void,
    ...types: CtorsOf<T>
  ): void {
    this.matchingIds(...types).forEach((id: EntityId) => {
      let entity = this.entities[id];
      let instances = types.map(t => entity.component(t)) as T;
      callback(entity, ...instances);
    });
  }

  /** Gets the IDs of all entities that have a set of components
   *
   * @param types - Component types that if an Entity has instances of will have its ID in the output.
   *
   * @returns - IDs of all entities that have instances of the component types provided
   */

  matchingIds(...types: ComponentConstructor[]): number[] {
    const working: Set<number>[] = types
      .filter((type: ComponentConstructor) => this.componentEntities.has(type))
      .map((type: ComponentConstructor) => this.componentEntities.get(type)!);
    if (working.length !== 0 && working.length === types.length) {
      return Array.from(
        working.reduce((accum: Set<number>, curr: Set<number>) =>
          setIntersect(accum, curr)
        )
      );
    } else {
      return [];
    }
  }

  /** Add or replace a component on an entity by name or ID
   *
   * @param id - Either an entityID or an entity name
   *
   * @throws {Error} - If an entity with the provided name or ID doesn't exist
   */
  setComponent<T extends Component>(
    id: EntityId | string,
    component: T
  ): void | never {
    const entityId = typeof id === 'string' ? this.entityNameMapping[id] : id;
    this.checkEntity(entityId);
    let componentType = Object.getPrototypeOf(component).constructor;
    if (this.entities[entityId].has(componentType)) {
      this.removeComponent(entityId, componentType, false);
    }
    const otherComponents = this.excludeComponents(entityId, [componentType]);
    this.entities[entityId] = new Entity(entityId, [
      ...otherComponents,
      component
    ]);
    this.housekeepAddComponent(entityId, component);
  }

  /** Checks whether a component of the specified type exists on the specified entity
   *
   * @returns - True if the entity has the component, false otherwise
   *
   * @throws - If an entity with the ID doesn't exist
   */
  hasComponent(
    id: EntityId | string,
    type: ComponentConstructor
  ): boolean | never {
    const entityId = typeof id === 'string' ? this.entityNameMapping[id] : id;
    this.checkEntity(entityId);

    return this.entities[entityId].has(type);
  }

  /** Removes any component instance present on an entity based on the provided component type
   *
   * @note doesn't send a notification if there was not component on the entity to remove
   *
   * @param id - Either an entityID or an entity name
   *
   * @returns {boolean} - If a component existed on the entity and was removed, false otherwise.
   *
   * @throws {Error} - If an entity with the provided name or ID doesn't exist
   */
  removeComponent(
    id: EntityId | string,
    type: ComponentConstructor,
    notify: boolean = true
  ): boolean | never {
    const entityId = typeof id === 'string' ? this.entityNameMapping[id] : id;
    this.checkEntity(entityId);
    if (this.entities[entityId].has(type)) {
      const toRemove = this.entities[entityId].component(type);
      this.entities[entityId] = new Entity(
        entityId,
        this.excludeComponents(entityId, [type])
      );
      this.housekeepRemoveComponent(entityId, toRemove, notify);
      return true;
    } else {
      return false;
    }
  }

  /** Subscribe to be notified when an Entity is modified
   *
   * @param id: Id of the entity to monitor.
   * @param callback: Receives the new version of the entity or null if the entity was deleted.
   */
  observeEntity$(id: EntityId): Observable<Entity | null> {
    this.checkEntity(id);
    if (!this.entityRegistrations.has(id)) {
      this.entityRegistrations.set(id, new Subject<Entity | null>());
    }
    return this.entityRegistrations.get(id)!;
  }

  /** Subscribe to be notified when a component on a specific entity is updated
   *
   * @param id  - Id of the entity
   * @param type - The component to type to get notifications of
   */
  observeEntityComponent$<T_Constructor extends ComponentConstructor>(
    id: EntityId,
    type: T_Constructor
  ): Observable<ComponentChange<InstanceType<T_Constructor>>> {
    this.checkEntity(id);
    return this.observeComponentType$(type).pipe(
      filter(change => change.id === id)
    );
  }

  /** Subscribe by name to be notified when an Entity is modified
   *
   * @param name: Name of the entity to monitor.
   * @param callback: Receives the new version of the entity or null if the entity was deleted.
   */
  observeNamedEntity$(name: string): Observable<Entity | null> {
    const id = this.entityNameMapping[name];
    if (id === undefined) {
      throw new Error(
        `Attempt to monitor entity with name: ${name}, which doesn't exist!`
      );
    } else {
      return this.observeEntity$(id);
    }
  }

  /** Subscribe to be notified when a type of component is modified
   *
   * @param type: Constructor function of the Component type that events are to be sent for.
   * @param callback: receives Entity, EntityId and component on change, null values for entity component indicate deletion.
   */
  observeComponentType$<T_Constructor extends ComponentConstructor>(
    type: T_Constructor
  ): Observable<ComponentChange<InstanceType<T_Constructor>>> {
    if (!this.componentRegistrations.has(type)) {
      this.componentRegistrations.set(
        type,
        new Subject<ComponentChange<InstanceType<ComponentConstructor>>>()
      );
    }
    return this.componentRegistrations.get(type)!;
  }

  /** Completely reset the state of the entity manager to a clean state, clears everything
   */
  clear(): void {
    this.init();
  }

  /** Get the total number of entities currently being managed
   */
  count(): number {
    return Object.keys(this.entities).length;
  }

  /** Get the state of the ECS as a JSON data structure
   */
  toData() {
    const data: ECSData = {
      indexed: [],
      entities: {}
    };

    for (const [id, entity] of Object.entries(this.entities)) {
      data.entities[id] = data.entities[id] || {};
      for (const { name, component } of entity.allComponents()) {
        data.entities[id][name] = JSON.parse(JSON.stringify(component));
      }
    }

    data.indexed = Array.from(this.componentValueEntities.keys()).map(
      componentConstructor => componentConstructor.name
    );

    return data;
  }

  /** Set the state of the ECS from the data provided
   *
   * @param data JSON representation of the ECS state, usually obtained by the toData() method on an existing instance
   * @param componentTypes A dictionary of Constructor functions used to instantiate components by name
   *
   * @note Doesn't make any consideration for event registrations, these have to be set up manually.
   */
  fromData(
    data: ECSData,
    componentTypes: { [name: string]: new (...args: any[]) => any }
  ): EntityId {
    let highestId: EntityId = 0;
    this.clear();
    for (const [entityId, components] of Object.entries(data.entities)) {
      const idAsNumber = Number(entityId);
      const entityComponents: Component[] = [];
      highestId = Math.max(highestId, idAsNumber);
      for (const [componentName, componentData] of Object.entries(components)) {
        if (componentName in componentTypes) {
          const component = new componentTypes[componentName](componentData);
          entityComponents.push(component);
        } else {
          throw Error(
            `Component in input data: ${componentName} is not in type index!`
          );
        }
      }
      this._createEntity(Number(entityId), ...entityComponents);
    }
    for (const componentName of data.indexed) {
      if (componentName in componentTypes) {
        this.indexBy(componentTypes[componentName]);
      } else {
        throw Error(
          `Component to index by: ${componentName} is not in type index!`
        );
      }
    }
    this.currId = highestId + 1;
    return highestId;
  }

  private housekeepAddComponent(
    id: EntityId,
    component: Component
  ): void | never {
    const type = Object.getPrototypeOf(component).constructor;

    if (this.componentEntities.get(type) === undefined) {
      this.componentEntities.set(type, new Set<EntityId>());
    }

    this.componentEntities.get(type)!.add(id);

    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.add(component, id);
    }

    if (this.entityRegistrations.has(id)) {
      this.entityRegistrations.get(id)!.next(this.entities[id]);
    }

    const constructor = component.constructor as ComponentConstructor;
    if (this.componentRegistrations.has(constructor)) {
      (this.componentRegistrations.get(constructor) as Subject<
        ComponentChange<Component>
      >).next({
        id: id,
        e: this.entities[id],
        c: component
      });
    }
  }

  private housekeepRemoveComponent(
    id: EntityId,
    component: Component,
    notify: boolean
  ): void {
    const type = Object.getPrototypeOf(component).constructor;
    if (this.componentEntities.has(type)) {
      this.componentEntities.get(type)!.delete(id);
    }
    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.remove(component, id);
    }
    if (notify) {
      let entityValue = this.entities[id];
      if (this.entityRegistrations.has(id)) {
        this.entityRegistrations.get(id)!.next(entityValue);
      }

      const constructor = component.constructor as ComponentConstructor;
      if (this.componentRegistrations.has(constructor)) {
        (this.componentRegistrations.get(constructor) as Subject<
          ComponentChange<Component>
        >).next({
          id: id,
          e: entityValue
        });
      }
    }
  }

  private excludeComponents(
    id: EntityId,
    types: ComponentConstructor[]
  ): Component[] {
    return this.entities[id]
      .allComponents()
      .filter((ce: ComponentEntry) => {
        return (
          types.indexOf(Object.getPrototypeOf(ce.component).constructor) === -1
        );
      })
      .map((ce: ComponentEntry) => ce.component);
  }

  private checkEntity(id: EntityId): void | never {
    if (!this.exists(id)) {
      throw Error(`Entity with id: ${id} doesn't exist!`);
    }
  }

  private _createEntity(id: EntityId, ...components: Component[]): Entity {
    const entity = new Entity(id, components);
    this.entities[id] = entity;
    for (const component of components) {
      this.housekeepAddComponent(id, component);
    }

    return entity;
  }

  private indexedEntitiesForType<T extends Component>(
    component: T
  ): HashTable<Hashable> {
    const type = Object.getPrototypeOf(component).constructor;
    const typeEntities = this.componentValueEntities.get(type);
    if (!typeEntities) {
      throw Error(
        `Attempt to retrieve by component ??? not set up for indexing`
      );
    }
    return typeEntities;
  }
}
