
import {HashTable, Hashable} from './hashtable';

import {Component, ComponentConstructor} from './component';

import { setIntersect } from './utils'

export * from './component';


export class Entity {
  private components_ = new Map<ComponentConstructor, Component>();
  constructor(
    private id_: number,
    components: Component[]
  ) {
    for (const component of components) {
      this.components_.set(Object.getPrototypeOf(component).constructor, component);
    }
  }

  component<T extends ComponentConstructor>(type: T): InstanceType<T> | never {
    const c: Component | undefined = this.components_.get(type);
    if (c !== undefined) {
      return <InstanceType<T>> c;
    } else {
      throw Error(`Component requested: ${type.name} couldn't be found!`);
    }
  }

  components<T extends Array<ComponentConstructor>>(...types: T): {[K in keyof T]: T[K] extends ComponentConstructor ? InstanceType<T[K]> : never}
  components(...types: any[]): any[]
  {
    return types.map( (t: ComponentConstructor) => {
      let c = this.components_.get(t);
      if ( ! c ) {
        throw Error(`Component requested: ${t.name}, couldn't be found`);
      }
      return c;
     });
  }

  allComponents(): Component[] {
    return Array.from(this.components_.values());
  }

  has(types: ComponentConstructor | ComponentConstructor[]): boolean {
    if ( types instanceof Array) {
      for (const type of types) {
        if ( ! (this.components_.has(type)) ) {
          return false;
        }
      }
      return true;
    } else {
      return this.components_.has(types);
    }
  }

  id(): number {
    return this.id_;
  }
}

export class EntityManager {
  private currId = 0;
  private entities: {[id: number]: Entity} = {};
  private componentEntities = new Map<ComponentConstructor, Set<number>>();
  private componentValueEntities = new Map<ComponentConstructor, HashTable<Hashable>>();

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
    return [valueIndex.countUnique(), count];
  }

  getByComponentIndex<T extends Component>(component: T): Entity[] {
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
  
  each(
    callback: (e: Entity, ...c: any[]) => void,
    ...types: ComponentConstructor[]): void {

    let entity = 
    this.matchingIds(...types).forEach( (id: number) => {
      let e = this.entities[id];
      callback(e, e.components(...types));
     } );
  }

  matchingIds(...types: ComponentConstructor[]): number[] {

    const working: Set<number>[] = types
      .filter( (type: ComponentConstructor) => this.componentEntities.has(type)! )
      .map( (type: ComponentConstructor) => this.componentEntities.get(type)! );
    if (working.length !== 0) {
      return Array.from(working.reduce( (accum: Set<number>, curr: Set<number>) => setIntersect(accum, curr) ));
    } else {
      return [];
    }
  }

  removeEntity(id: number): boolean {
    if ( ! this.exists(id) ) {
      return false;
    }

    for (const component of this.entities[id].allComponents()) {
      this.housekeepRemoveComponent(id, component);
    }

    delete this.entities[id];
    for (const idIndex of this.componentEntities.values()) {
      idIndex.delete(id);
    }

    return true;
  }

  setComponent<T extends Component>(id: number, component: T): void | never {
    this.checkEntity(id);
    const otherComponents = this.excludeComponents(id, [Object.getPrototypeOf(component).constructor]);
    this.entities[id] = new Entity(id, [...otherComponents, component]);
    this.housekeepAddComponent(id, component);
  }

  removeComponent(id: number, type: ComponentConstructor): void | never {
    this.checkEntity(id);
    const toRemove = this.entities[id].component(type);
    this.entities[id] = new Entity(id, this.excludeComponents(id, [type]));
    this.housekeepRemoveComponent(id, toRemove);
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
  }

  private housekeepRemoveComponent(id: number, component: Component): void {
    const type = Object.getPrototypeOf(component).constructor;
    if ( this.componentEntities.has(type) ) {
      this.componentEntities.get(type)!.delete(id);
    }
    if (this.componentValueEntities.has(type)) {
      this.componentValueEntities.get(type)!.remove(component, id);
    }
  }

  private excludeComponents(id: number, types: ComponentConstructor[]): Component[] {
    return this.entities[id].allComponents().filter( (c: Component) => types.indexOf(Object.getPrototypeOf(c).constructor) === -1 );
  }

  private checkEntity(id: number): void | never {
    if ( ! this.exists(id) ) {
      throw Error(`Attempt to replace component on entity ${id} that doesn't exist!`);
    }
  }

}
