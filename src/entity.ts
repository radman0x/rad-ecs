import { Component, ComponentConstructor } from './component';

export interface ComponentEntry {
  name: string;
  component: Component;
}

export class Entity {
  private components_ = new Map<ComponentConstructor, Component>();

  constructor(private id_: number, ...components: Component[]) {
    if (components) {
      for (const component of components) {
        this.components_.set(
          Object.getPrototypeOf(component).constructor,
          component
        );
      }
    }
  }

  component<T extends ComponentConstructor>(type: T): InstanceType<T> | never {
    const c: Component | undefined = this.components_.get(type);
    if (c !== undefined) {
      return c as InstanceType<T>;
    } else {
      throw Error(`Component requested: ${type.name} couldn't be found!`);
    }
  }

  components<T extends Array<ComponentConstructor>>(
    ...types: T
  ): {
    [K in keyof T]: T[K] extends ComponentConstructor
      ? InstanceType<T[K]>
      : never;
  };
  components(...types: any[]): any[] {
    return types.map((t: ComponentConstructor) => {
      let c = this.components_.get(t);
      if (!c) {
        throw Error(`Component requested: ${t.name}, couldn't be found`);
      }
      return c;
    });
  }

  allComponents(): ComponentEntry[] {
    const components: ComponentEntry[] = [];
    for (const [componentConstructor, component] of this.components_) {
      components.push({
        name: componentConstructor.name,
        component: component
      });
    }
    return components;
  }

  has(types: ComponentConstructor | ComponentConstructor[]): boolean {
    if (types instanceof Array) {
      for (const type of types) {
        if (!this.components_.has(type)) {
          return false;
        }
      }
      return true;
    } else {
      return this.components_.has(types);
    }
  }

  get id(): number {
    return this.id_;
  }
}
