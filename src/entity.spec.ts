import { Entity } from './entity';
import {
  Position,
  Physical,
  Size,
  Renderable,
  MoveTo
} from './dummy-components.model';

describe('Entity', () => {
  let e: Entity;
  beforeAll(() => {
    e = new Entity(-1, new Position({ x: 5, y: 5 }), new Physical(Size.FILL));
  });

  it('should report existence of components', () => {
    expect(e.has([Position])).toBeTruthy();
    expect(e.has([Physical])).toBeTruthy();
    expect(e.has([Renderable])).toBeFalsy();
  });

  it('should retrieve one component AND access', () => {
    let [c] = e.components(Position);
    expect(c.x).toEqual(5);
  });

  it('should retrieve two components AND accesstheir data', () => {
    let [p, y] = e.components(Position, Physical);
    expect(p.x).toEqual(5);
    expect(y.size).toEqual(Size.FILL);
  });

  it('shnould fail to retrieve a component that does not exist', () => {
    expect(() => e.components(Position, Physical, MoveTo)).toThrow();
  });
});
