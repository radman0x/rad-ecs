
import { Hashable } from './hashtable';

export class Component extends Hashable {

}

export type ComponentConstructor = { new(...args: any[]): Component };
