import {} from 'jasmine';

import {HashTable, Hashable} from './hashtable'

class Example implements Hashable {
  
  constructor(
    public x: number,
    public y: number
  ) {}

  hash(): string {
    return `${this.x}${this.y}`;
  }
}

describe('HashTable', () => {
  let hashTable: HashTable<Hashable>;
  beforeEach( () => hashTable = new HashTable<Example>());
  
  it('Sets a value', () => {
    const value = 11;
    hashTable.add(new Example(1,1), value);
    expect(() => hashTable.get(new Example(1,1))).not.toThrow();
    expect(hashTable.get(new Example(1,1))).toContain(value);
    expect(hashTable.has(new Example(1,1))).toBeTruthy();
    expect(hashTable.count(new Example(1,1))).toEqual(1);
  });

  it('Sets and retrieves from a grid', () => {
    const WIDTH = 15;
    const HEIGHT = 15;
    for (let x = 0; x < WIDTH; ++x) {
      for (let y = 0; y < HEIGHT; ++y) {
        if (x % 2 && y % 2) {
          hashTable.add(new Example(x, y), 1);
        }
      }
    }
    for (let x = 0; x < WIDTH; ++x) {
      for (let y = 0; y < HEIGHT; ++y) {
        if (x % 2 && y % 2) {
          expect(hashTable.has(new Example(x, y))).toBeTruthy();
        } else {
          expect(hashTable.has(new Example(x, y))).toBeFalsy();
        }
      }
    }
  });
});

