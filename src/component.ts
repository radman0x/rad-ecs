import { Hashable } from './hashtable';

export class Component extends Hashable {
  clone() {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }
}

export type ComponentConstructor = { new (...args: any[]): Component };
