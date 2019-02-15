
import {} from 'jasmine';

import {EntityManager, Entity } from './entity-manager';
import {Component} from './component'

class Coord {
  constructor(
    public x: number,
    public y: number
  ) {}

  equals(rhs: Coord): boolean {
    return rhs.x === this.x && rhs.y === this.y;
  }

  add(rhs: Coord): Coord {
    return new Coord(this.x + rhs.x, this.y + rhs.y);
  }

  subtract(rhs: Coord): Coord {
    return new Coord(this.x - rhs.x, this.y - rhs.y);
  }

  magnitude(): number {
    return Math.abs( Math.sqrt((this.x**2) + (this.y**2)) );
  }
}

class Position extends Component {
  private coord_: Coord;

  constructor(x: number, y: number) {
    super();
    this.coord_ = new Coord(x, y);
  }

  x(): number {
    return this.coord_.x;
  }

  y(): number {
    return this.coord_.y;
  }

  coord(): Coord {
    return this.coord_;
  }

  equals(rhs: Position): boolean {
    return rhs.x === this.x && rhs.y === this.y;
  }

  fullEquals(rhs: Position): boolean {
    return this.equals(rhs);
  }

  clone(x?: number, y?: number): Position {
    return new Position(
      x || this.coord_.x,
      y || this.coord_.y
    );
  }

  hash(): string {
    return `${this.coord_.x},${this.coord_.y}`;
  }
}

class Renderable extends Component {

  constructor(
    public image: string,
    public zOrder: number
  ) { super(); }

}

enum Size {
  FILL
}

class Physical extends Component {

 constructor(
   public size: Size
 ) { super(); }
}

class MoveTo extends Component {

 constructor(
   public direction: Coord
 ) { super(); }
}

describe('Entity Manager', () => {
  let em: EntityManager;
  beforeAll( () => { em = new EntityManager() } );
  
  describe('Basic Testing', () => {
    describe('Empty entities', () => {
      let emptyId: number;
      beforeEach( () => { 
        em = new EntityManager();
        emptyId = em.createEntity( [] ).id(); 
      });
      it('Creates an empty entity', () => {
        
        expect(em.count()).toEqual(1);
      });
    
      it('Retrieves entity by Id', () => {
        expect(em.exists(emptyId)).toBeTruthy();
        expect(() => em.get(emptyId)).not.toThrow();
        expect(() => em.get(-1)).toThrow();
      });
    
      it('Removes empty entity', () => {
        expect(em.removeEntity(emptyId)).toBeTruthy();
        expect(() => em.get(emptyId)).toThrow();
      });
    });
  
    describe('Component initialised entities', () => {
      let initialisedId: number;
      beforeEach( () => {
        em = new EntityManager();
        initialisedId = em.createEntity([
          new Position(7,7), 
          new Physical(Size.FILL)] 
        ).id();
      });
      it('Creates entity with component list', () => {
        expect(() => em.get(initialisedId)).not.toThrow();
        expect(em.matchingIds( [Position] )).toContain(initialisedId);
        expect(em.matchingIds( [Physical] )).toContain(initialisedId);
        expect(em.matchingIds( [Physical, Position] )).toContain(initialisedId);
      });
    
      it('Removes component list entity', () => {
        expect(em.removeEntity(initialisedId)).toBeTruthy();
        expect(() => em.get(initialisedId)).toThrow();
        expect(em.matchingIds( [Position] )).not.toContain(initialisedId);
        expect(em.matchingIds( [Physical] )).not.toContain(initialisedId);
        expect(em.matchingIds( [Physical, Position] )).not.toContain(initialisedId);
      });
    })
  
    describe('Manually creating components on entities', () => {
      let manualId: number;
      beforeEach( () => {
        em = new EntityManager();
        manualId = em.createEntity( [] ).id();
        em.setComponent(manualId, new Position(1,1));
      });

      it('Creates entity by setting components manually' , () => {
        expect(() => em.get(manualId)).not.toThrow();
        expect(em.matchingIds( [Position] )).toContain(manualId);
        expect(em.get(manualId).has(Position));
      });
    
      it('Removes manual entity', () => {
        expect(em.removeEntity(manualId)).toBeTruthy();
        expect(() => em.get(manualId)).toThrow();
        expect(em.count()).toEqual(0);
      });

    });
    
  });

  describe('Retrieving entities by component types', () => {
    beforeEach( () => {
      em = new EntityManager();
      em.createEntity( [new Position(2, 2)] );
      em.createEntity( [new Position(3, 3)] );
      em.createEntity( [new Renderable('', 1)] );
      em.createEntity( [new Physical(Size.FILL), new Position(11, 11)]);
    });

    it('Provides entities with 1 matching components', () => {
      const posEntities = em.matching( [Position] );
      expect(posEntities.length).toEqual(3);
    });

    it('Provides entities with 1 matching components again', () => {
      const visEntities = em.matching( [Renderable] );
      expect(visEntities.length).toEqual(1);
    });

    it('Provides entities with 2 matching components', () => {
      const visEntities = em.matching( [Position, Physical] );
      expect(visEntities.length).toEqual(1);
    });

    it(`Provides entities that don't exist`, () => {
      const emptyEntities = em.matching( [MoveTo] );
      expect(emptyEntities.length).toEqual(0);
    });

    it('Replaces a component on an entity', () => {
      const id = em.createEntity( [new Position(5,5)] ).id();
      em.setComponent(id, new Position(2,2));
      expect(em.get(id).component(Position).equals(new Position(2,2))).toBeTruthy();
    });

  });

  describe('Using component values to retrieve entities', () => {
    let unique: number;
    let total: number;
    beforeAll( () => {
      em = new EntityManager();
      em.createEntity( [new Position(1, 1)] );
      em.createEntity( [new Position(2, 2)] );
      em.createEntity( [new Position(3, 3)] );
      em.createEntity( [new Position(1, 1)] );
      [unique, total] = em.indexBy(Position);
    });

    it(`Checks for correct number of entities`, () => {
      expect(em.count()).toEqual(4);
    })

    it('Allows indexing by component value', () => {
      let [unique, total] = em.indexBy(Position);
      expect(unique).toEqual(3);
      expect(total).toEqual(4);
    });

    it ('Retrieves entity by component value', () => {
      expect(em.getByComponentIndex(new Position(1, 1)).length).toEqual(2);
      expect(em.getByComponentIndex(new Position(2, 2)).length).toEqual(1);
      expect(em.getByComponentIndex(new Position(3, 3)).length).toEqual(1);
    });
  });

  describe('Executing a lambda on matching components', () => {
    beforeAll( () => {
      em = new EntityManager();
      em.createEntity( [new Position(1, 5)] );
      em.createEntity( [new Position(1, 7)] );
      em.createEntity( [new Position(1, 5), new Renderable('aoeu', 1)] );
      em.createEntity( [new Renderable('uudd', 0), new Physical(Size.FILL)] );
      em.createEntity( [new Renderable('uudd', 0), new Physical(Size.FILL), new Position(7, 7)] );
    });

    it('executes lambda on one matching component', () => {
      let count = 0;
      em.each( [Position], (e: Entity) => ++count );
      expect(count).toEqual(4);
    });

    it('executes lambda on two matching components', () => {
      let count = 0;
      em.each( [Position, Renderable], (e: Entity) => ++count );
      expect(count).toEqual(2);
    });

    it('executes lambda on three matching components', () => {
      let count = 0;
      em.each( [Position, Renderable, Physical], (e: Entity) => ++count );
      expect(count).toEqual(1);
    });
  });
});

describe('Entity', () => {
  const e = new Entity(-1, [new Position(5, 5), new Physical(Size.FILL)]);

  it('Reports existence of components', () => {
    expect(e.has( [Position] )).toBeTruthy();
    expect(e.has( [Physical] )).toBeTruthy();
    expect(e.has( [Renderable] )).toBeFalsy();
  });

});
