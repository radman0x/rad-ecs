import { Entity } from './entity';

import { HashTable, Hashable } from './hashtable';

import { Component, ComponentConstructor } from './component';

import { setIntersect } from './utils'

import { Subscription, Observable, Subject } from 'rxjs';

export * from './component';


type Ctor<C> = new (...args: any[]) => C;
type CtorsOf<T> = { [K in keyof T]: Ctor<T[K]> };

type EntityId = number;

export interface ComponentChange<T extends Component> {
  id: EntityId,
  e?: Entity,
  c?: T
}

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
    const entity = new Entity(id, components);
    this.entities[id] = entity;
    for (const component of components) {
      this.housekeepAddComponent(id, component);
    }

    return entity;
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

    for (const component of components) {
      this.housekeepRemoveComponent(id, component, true);
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

  indexBy(type: ComponentConstructor): [number, number] {
    const valueIndex = new HashTable<Hashable>();

    let count = 0;
    let typeEntities = this.componentEntities.get(type);
    if ( typeEntities ) {
      for (const id of typeEntities) {
        const component = this.entities[id].component(type);
        valueIndex.add(component, id);
        ++count;
      }
    }
    this.componentValueEntities.set(type, valueIndex);
    return [valueIndex.countKeys(), count];
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

  monitor(id: EntityId, callback: (e: Entity | null) => void): Subscription {
    if ( ! this.entityRegistrations.has(id) ) {
      console.log(`setting registration on: ${id}`);
      this.entityRegistrations.set(id, new Subject<Entity | null>());
    }
    console.log(`subscribing`);
    return this.entityRegistrations.get(id)!.subscribe(callback);
  }

  monitorNamed(name: string, callback: (e: Entity | null) => void): Subscription {
    const id = this.entityNameMapping[name];
    if ( id === undefined ) {
      throw new Error(`Attempt monitor entity with name: ${name}, which doesn't exist!`);
    } else {
      return this.monitor(id, callback);
    }
  }

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
    return this.entities[id].allComponents().filter( (component: Component) => types.indexOf(Object.getPrototypeOf(component).constructor) === -1 );
  }

  private checkEntity(id: EntityId): void | never {
    if ( ! this.exists(id) ) {
      throw Error(`Attempt to replace component on entity ${id} that doesn't exist!`);
    }
  }

}
