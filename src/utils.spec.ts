
import { setIntersect } from './utils'

describe('Set intersection operation', () => {
  it('Checks intersection', () => {
    const left = new Set([1, 2, 3, 4, 5, 6]);
    const right = new Set([4, 5, 6, 7, 8, 9]);
    const result = setIntersect(left, right);
    expect(result).toEqual(new Set( [4, 5, 6] ));

  });
});