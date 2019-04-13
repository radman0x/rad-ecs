import { Entity } from './entity';

import { HashTable, Hashable } from './hashtable';

import { Component, ComponentConstructor } from './component';

import { setIntersect } from './utils'

import { Subscription, Observable, Subject } from 'rxjs';

export * from './component';


type Ctor<C> = new (...args: any[]) => C;
type CtorsOf<T> = { [K in keyof T]: Ctor<T[K]> };

export interface ComponentChange<T extends Component> {
  id: number,
  e: Entity | null,
  c: T | null
}

export class EntityManager {
  private currId = 0;
  private entities: {[id: number]: Entity} = {};
  private componentEntities = new Map<ComponentConstructor, Set<number>>();
  private componentValueEntities = new Map<ComponentConstructor, HashTable<Hashable>>();
  private entityRegistrations = new Map<number, Subject<Entity | null>>();
  private componentRegistrations = new Map<ComponentConstructor, Subject<any>>();

  constructor() {
  }

  init(): void {
    this.currId = 0;
    this.entities = {};
    this.componentEntities = new Map<ComponentConstructor, Set<number>>();
    this.componentValueEntities = new Map<ComponentConstructor, HashTable<Hashable>>();
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

  get(id: number): Entity | never {
    if (!this.exists(id)) {
      throw Error(`Entity with id: ${id} doesn't exist`);
    } else {
      return this.entities[id];
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

  hasIndex<T extends Component>(entityId: number, component: T): boolean {
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

    return typeEntities.get(component).map( (id: number) => this.entities[id] );
  }

  exists(id: number): boolean {
    return (id in this.entities);
  }

  matching(...types: ComponentConstructor[]): Entity[] {
    return this.matchingIds(...types).map( (id: number) => this.entities[id] );
  }
  


  each<T extends Component[]>(
    callback: (e: Entity, ...component: T) => void,
    ...types: CtorsOf<T>): void {

    this.matchingIds(...types).forEach( (id: number) => {
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

  removeEntity(id: number): boolean {
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

  setComponent<T extends Component>(id: number, component: T): void | never {
    this.checkEntity(id);
    let componentType = Object.getPrototypeOf(component).constructor;
    if ( this.entities[id].has(componentType) ) {
      this.removeComponent(id, componentType, false);
    }
    const otherComponents = this.excludeComponents(id, [componentType]);
    this.entities[id] = new Entity(id, [...otherComponents, component]);
    this.housekeepAddComponent(id, component);
  }

  removeComponent(id: number, type: ComponentConstructor, notify: boolean = true): void | never {
    this.checkEntity(id);
    const toRemove = this.entities[id].component(type);
    this.entities[id] = new Entity(id, this.excludeComponents(id, [type]));
    this.housekeepRemoveComponent(id, toRemove, notify);
  }

  monitorEntity(id: number, callback: (e: Entity | null) => void): Subscription {
    if ( ! this.entityRegistrations.has(id) ) {
      console.log(`setting registration on: ${id}`);
      this.entityRegistrations.set(id, new Subject<Entity | null>());
    }
    console.log(`subscribing`);
    return this.entityRegistrations.get(id)!.subscribe(callback);
  }

  monitorComponentType<T_Constructor extends ComponentConstructor>(
    type: T_Constructor, 
    callback: (change: ComponentChange<InstanceType<T_Constructor>>) => void
  ) {
    if ( ! this.componentRegistrations.has(type) ) {
      this.componentRegistrations.set(type, new Subject<ComponentChange<InstanceType<ComponentConstructor>>>());
    }
    this.componentRegistrations.get(type)!.subscribe(callback);
  }

  clear(): void {
    this.init();
  }

  count(): number {
    return Object.keys(this.entities).length;
  }

  private housekeepAddComponent(id: number, component: Component): void | never {
    const type = Object.getPrototypeOf(component).constructor;

    if ( this.componentEntities.get(type) === undefined ) {
      this.componentEntities.set(type, new Set<number>());
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

  private housekeepRemoveComponent(id: number, component: Component, notify: boolean): void {
    const type = Object.getPrototypeOf(component).constructor;
    if ( this.componentEntities.has(type) ) {
      this.componentEntities.get(type)!.delete(id);
    }
    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.remove(component, id);
    }
    if (notify) {
      let entityValue = this.entities[id] ? this.entities[id] : null;
      if ( this.entityRegistrations.has(id) ) {
        this.entityRegistrations.get(id)!.next(entityValue);
      }
  
      const constructor = component.constructor as ComponentConstructor;
      if ( this.componentRegistrations.has(constructor) ) {
        (this.componentRegistrations.get(constructor) as Subject<ComponentChange<Component>>).next({
          id: id,
          e: entityValue,
          c: null 
        });
      }
    }
  }

  private excludeComponents(id: number, types: ComponentConstructor[]): Component[] {
    return this.entities[id].allComponents().filter( (component: Component) => types.indexOf(Object.getPrototypeOf(component).constructor) === -1 );
  }

  private checkEntity(id: number): void | never {
    if ( ! this.exists(id) ) {
      throw Error(`Attempt to replace component on entity ${id} that doesn't exist!`);
    }
  }

}
