
export class Hashable {
  
  hash(): string | never {
    throw Error(`Hashing not implemented for object`);
  }
}

export class HashTable<T_Key extends Hashable> {

  private values: {[hash: string]: Set<number>} = {}

  constructor() {}

  *[Symbol.iterator](): IterableIterator<[string, Set<number>]> {
    for (const e of Object.entries(this.values)) {
      yield e;
    }
  }

  add(key: T_Key, value: number): void {
    this.values[key.hash()] = this.values[key.hash()] || new Set<number>()
    this.values[key.hash()].add(value);
  }

  get(key: T_Key): number[] {
    if ( ! (key.hash() in this.values) ) {
      return [];
    }
    return Array.from(this.values[key.hash()]);
  }

  remove(key: T_Key, value: number): boolean {
    if ( ! (key.hash() in this.values) ) {
      return false;
    }
    this.values[key.hash()].delete(value);
    if ( this.values[key.hash()].size === 0 ) {
      delete this.values[key.hash()];
    }
    return true;
  }

  has(key: T_Key): boolean {
    return (key.hash() in this.values);
  }

  hasValue(key: T_Key, value: number): boolean {
    return this.has(key) && this.values[key.hash()]!.has(value);
  }

  count(key: T_Key): number {
    if ( ! this.has(key ) ) {
      return 0;
    }
    return this.values[key.hash()].size;
  }

  countKeys(): number {
    return Object.keys(this.values).length;
  }

}
