import { Entity, ComponentEntry } from './entity';

import { HashTable, Hashable } from './hashtable';

import { Component, ComponentConstructor } from './component';

import { setIntersect } from './utils'

import { Subscription, Observable, Subject } from 'rxjs';

export * from './component';


type Ctor<C> = new (...args: any[]) => C;
type CtorsOf<T> = { [K in keyof T]: Ctor<T[K]> };

type EntityId = number;

export interface ComponentChange<T_Component extends Component> {
  id: EntityId,
  e?: Entity,
  c?: T_Component
}

export interface ComponentIndexingInfo {
  uniqueComponentValues: number, 
  totalComponents: number
}

export interface ECSData {
  indexed: string[],
  entities: {
    [entityId: string]: JsonObject;
  }
};

export class EntityManager {
  private currId!                : EntityId;
  private entities!              : {[id: number]: Entity};
  private entityNameMapping!     : {[name: string]: EntityId};
  private componentEntities!     : Map<ComponentConstructor, Set<EntityId>>;
  private componentValueEntities!: Map<ComponentConstructor, HashTable<Hashable>>;
  private entityRegistrations!   : Map<number, Subject<Entity | null>>;
  private componentRegistrations!: Map<ComponentConstructor, Subject<any>>;

  constructor() {
    this.init();
  }

  init(): void {
    this.currId                 = 0;
    this.entities               = {};
    this.entityNameMapping      = {}
    this.componentEntities      = new Map<ComponentConstructor, Set<EntityId>>();
    this.componentValueEntities = new Map<ComponentConstructor, HashTable<Hashable>>();
    this.entityRegistrations    = new Map<number, Subject<Entity | null>>();
    this.componentRegistrations = new Map<ComponentConstructor, Subject<any>>();
  }

  createEntity(...components: Component[]): Entity {
    const id = this.currId++;
    return this._createEntity(id, ...components);
  }

  createNamedEntity(name: string, ...components: Component[]): Entity {
    if ( name in this.entityNameMapping) {
      throw new Error(`Entity with name: ${name} already exists!`);
    }
    const newEntity = this.createEntity(...components);
    this.entityNameMapping[name] = newEntity.id;
    return newEntity;
  }

  get(id: EntityId): Entity | never {
    if (!this.exists(id)) {
      throw Error(`Entity with id: ${id} doesn't exist`);
    } else {
      return this.entities[id];
    }
  }

  getNamed(name: string): Entity | never {
    const id = this.entityNameMapping[name];
    if ( id === undefined ) {
      throw new Error(`Entity with name: ${name} doesn't exist`);
    }
    try {
      return this.get(id);
    } catch {
      throw new Error(`Named entity points at entity with id: ${id}, which doesn't exist!`);
    }
  }

  remove(id: EntityId): boolean {
    if ( ! this.exists(id) ) {
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

  removeNamed(name: string): boolean {
    const id = this.entityNameMapping[name];
    if ( id === undefined ) {
      return false;
    } else {
      return this.remove(id);
    }
  }

  indexBy(componentType: ComponentConstructor): ComponentIndexingInfo  {
    const valueIndex = new HashTable<Hashable>();

    let count = 0;
    let typeEntities = this.componentEntities.get(componentType);
    if ( typeEntities ) {
      for (const id of typeEntities) {
        const component = this.entities[id].component(componentType);
        valueIndex.add(component, id);
        ++count;
      }
    }
    this.componentValueEntities.set(componentType, valueIndex);
    return {uniqueComponentValues: valueIndex.countKeys(), totalComponents: count};
  }

  hasIndex<T extends Component>(entityId: EntityId, component: T): boolean {
    const type = Object.getPrototypeOf(component).constructor;
    return this.componentValueEntities.has(type) && this.componentValueEntities.get(type)!.hasValue(component, entityId);
  }

  countIndex<T extends Component>(component: T): number {
    return this.matchingIndex(component).length;
  }

  matchingIndex<T extends Component>(component: T): Entity[] {
    const type = Object.getPrototypeOf(component).constructor;
    const typeEntities = this.componentValueEntities.get(type);
    if ( ! typeEntities ) {
      throw Error(`Attempt to retrieve by component ??? not set up for indexing`);
    }

    return typeEntities.get(component).map( (id: EntityId) => this.entities[id] );
  }

  exists(id: number): boolean {
    return (id in this.entities);
  }

  matching(...types: ComponentConstructor[]): Entity[] {
    return this.matchingIds(...types).map( (id: EntityId) => this.entities[id] );
  }

  each<T extends Component[]>(
    callback: (e: Entity, ...component: T) => void,
    ...types: CtorsOf<T>): void {

    this.matchingIds(...types).forEach( (id: EntityId) => {
      let entity = this.entities[id];
      let instances = types.map( (t => entity.component(t) )) as T;
      callback(entity, ...instances);
     } );
  }

  matchingIds(...types: ComponentConstructor[]): number[] {

    const working: Set<number>[] = types.filter( (type: ComponentConstructor) => this.componentEntities.has(type) )
                                        .map( (type: ComponentConstructor) => this.componentEntities.get(type)! );
    if (working.length !== 0 && working.length === types.length) {
      return Array.from(working.reduce( (accum: Set<number>, curr: Set<number>) => setIntersect(accum, curr) ));
    } else {
      return [];
    }
  }

  setComponent<T extends Component>(id: EntityId | string, component: T): void | never {
    const entityId = typeof id === 'string' ? this.entityNameMapping[id] : id;
    this.checkEntity(entityId);
    let componentType = Object.getPrototypeOf(component).constructor;
    if ( this.entities[entityId].has(componentType) ) {
      this.removeComponent(entityId, componentType, false);
    }
    const otherComponents = this.excludeComponents(entityId, [componentType]);
    this.entities[entityId] = new Entity(entityId, [...otherComponents, component]);
    this.housekeepAddComponent(entityId, component);
  }

  removeComponent(id: EntityId | string, type: ComponentConstructor, notify: boolean = true): void | never {
    const entityId = typeof id === 'string' ? this.entityNameMapping[id] : id;
    this.checkEntity(entityId);
    const toRemove = this.entities[entityId].component(type);
    this.entities[entityId] = new Entity(entityId, this.excludeComponents(entityId, [type]));
    this.housekeepRemoveComponent(entityId, toRemove, notify);
  }

  /** Subscribe to be notified when an Entity is modified
   *
   * @param id: Id of the entity to monitor.
   * @param callback: Receives the new version of the entity or null if the entity was deleted.
   */
  monitor(id: EntityId, callback: (e: Entity | null) => void): Subscription {
    if ( ! this.entityRegistrations.has(id) ) {
      this.entityRegistrations.set(id, new Subject<Entity | null>());
    }
    return this.entityRegistrations.get(id)!.subscribe(callback);
  }

  /** Subscribe by name to be notified when an Entity is modified
   *
   * @param name: Name of the entity to monitor.
   * @param callback: Receives the new version of the entity or null if the entity was deleted.
   */
  monitorNamed(name: string, callback: (e: Entity | null) => void): Subscription {
    const id = this.entityNameMapping[name];
    if ( id === undefined ) {
      throw new Error(`Attempt to monitor entity with name: ${name}, which doesn't exist!`);
    } else {
      return this.monitor(id, callback);
    }
  }

  /** Subscribe to be notified when a type of component is modified
   *
   * @param type: Constructor function of the Component type that events are to be sent for.
   * @param callback: receives Entity, EntityId and component on change, null values for entity component indicate deletion.
   */
  monitorComponentType<T_Constructor extends ComponentConstructor>(
    type: T_Constructor,
    callback: (change: ComponentChange<InstanceType<T_Constructor>>) => void
  ): Subscription {
    if ( ! this.componentRegistrations.has(type) ) {
      this.componentRegistrations.set(type, new Subject<ComponentChange<InstanceType<ComponentConstructor>>>());
    }
    return this.componentRegistrations.get(type)!.subscribe(callback);
  }

  clear(): void {
    this.init();
  }

  count(): number {
    return Object.keys(this.entities).length;
  }

  /** Get the state of the ECS as data
   */
  toData() {
    const data: ECSData = {
      indexed: [],
      entities: {}
    };

    for ( const [id, entity] of Object.entries(this.entities) ) {
      data.entities[id] = data.entities[id] || {};
      for ( const {name, component} of entity.allComponents() ) {
        data.entities[id][name] = JSON.parse(JSON.stringify(component));
      }
    }

    data.indexed = Array.from( this.componentValueEntities.keys() ).map( componentConstructor => componentConstructor.name );

    return data;
  }

  /** Set the state of the ECS from the data provided
   * 
   * @param data JSON representation of the ECS state, usually obtained by the toData() method on an existing instance
   * @param componentTypes A dictionary of Constructor functions used to instantiate components by name
   * 
   * @note Doesn't retain any of the event registrations, these have to be set up manually.
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
        if ( componentName in componentTypes ) {
          const component = new componentTypes[componentName](componentData);
          entityComponents.push(component);
        } else {
          throw Error(`Component in input data: ${componentName} is not in type index!`);
        }
      }
      this._createEntity(Number(entityId), ...entityComponents);
    }
    for (const componentName of data.indexed) {
      if ( componentName in componentTypes ) {
        this.indexBy(componentTypes[componentName]);
      } else {
        throw Error(`Component to index by: ${componentName} is not in type index!`);
      }
    }
    this.currId = highestId + 1;
    return highestId;
  }

  private housekeepAddComponent(id: EntityId, component: Component): void | never {
    const type = Object.getPrototypeOf(component).constructor;

    if ( this.componentEntities.get(type) === undefined ) {
      this.componentEntities.set(type, new Set<EntityId>());
    }

    this.componentEntities.get(type)!.add(id);

    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.add(component, id);
    }

    if ( this.entityRegistrations.has(id) ) {
      this.entityRegistrations.get(id)!.next(this.entities[id]);
    }

    const constructor = component.constructor as ComponentConstructor;
    if ( this.componentRegistrations.has(constructor) ) {
      (this.componentRegistrations.get(constructor) as Subject<ComponentChange<Component>>).next({
        id: id,
        e: this.entities[id],
        c: component
      });
    }
  }

  private housekeepRemoveComponent(id: EntityId, component: Component, notify: boolean): void {
    const type = Object.getPrototypeOf(component).constructor;
    if ( this.componentEntities.has(type) ) {
      this.componentEntities.get(type)!.delete(id);
    }
    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.remove(component, id);
    }
    if (notify) {
      let entityValue = this.entities[id];
      if ( this.entityRegistrations.has(id) ) {
        this.entityRegistrations.get(id)!.next(entityValue);
      }

      const constructor = component.constructor as ComponentConstructor;
      if ( this.componentRegistrations.has(constructor) ) {
        (this.componentRegistrations.get(constructor) as Subject<ComponentChange<Component>>).next({
          id: id,
          e: entityValue
        });
      }
    }
  }

  private excludeComponents(id: EntityId, types: ComponentConstructor[]): Component[] {
    return this.entities[id].allComponents()
      .filter( (ce: ComponentEntry) => { 
        return types.indexOf(Object.getPrototypeOf(ce.component).constructor) === -1;
      })
      .map( (ce: ComponentEntry) => ce.component);
  }

  private checkEntity(id: EntityId): void | never {
    if ( ! this.exists(id) ) {
      throw Error(`Attempt to replace component on entity ${id} that doesn't exist!`);
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

}
