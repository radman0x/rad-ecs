
export class Hashable {
  
  hash(): string | never {
    throw Error(`Hashing not implemented for object`);
  }
}

export class HashTable<T_Key extends Hashable> {

  private values: {[hash: string]: Set<number>} = {}

  constructor() {}

  add(key: T_Key, value: number): void {
    this.values[key.hash()] = this.values[key.hash()] || new Set<number>()
    this.values[key.hash()].add(value);
  }

  get (key: T_Key): number[] {
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
    return true;
  }

  has(key: T_Key): boolean {
    return (key.hash() in this.values);
  }

  count(key: T_Key): number {
    if ( ! this.has(key ) ) {
      return 0;
    }
    return this.values[key.hash()].size;
  }

  countUnique(): number {
    return Object.keys(this.values).length;
  }

}