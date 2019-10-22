
import {EntityManager, ComponentChange } from './entity-manager';
import {Component} from './component'
import { Entity } from './entity';

interface Coord2 {
  x: number;
  y: number;
}

namespace coord2 {
  export function equals(lhs: Coord2, rhs: Coord2): boolean {
    return rhs.x === lhs.x && rhs.y === lhs.y;
  }
  
  export function add(lhs: Coord2, rhs: Coord2): Coord2 {
    return {x: lhs.x + rhs.x, y: lhs.y + rhs.y};
  }
  
  export function addTo(to: Coord2, add: Coord2): void {
    to.x = to.x + add.x; 
    to.y = to.y + add.y;
  }
  
  export function subtract(lhs: Coord2, rhs: Coord2): Coord2 {
    return {x: lhs.x - rhs.x, y: lhs.y - rhs.y};
  }
  
  export function subtractFrom(from: Coord2, subtract: Coord2): void {
    from.x = from.x - subtract.x 
    from.y = from.y - subtract.y;
  }
  
  export function magnitude(Coord2: Coord2): number {
    return Math.abs( Math.sqrt((Coord2.x**2) + (Coord2.y**2)) );
  }
}


class Position extends Component {
  public x: number;
  public y: number;

  constructor(coord: Coord2) {
    super();
    this.x = coord.x;
    this.y = coord.y;
  }


  hash(): string {
    return `${this.x},${this.y}`;
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
   public direction: Coord2
 ) { super(); }
}

const ID_NOT_EXIST = 9999999;

const SIMPLEST_ECS_DATA = () => ({
  indexed: [],
  entities: {
    0: {
      Position: { x: 1, y: 1 }
    }
  }
});

describe('Entity Manager', () => {
  let em: EntityManager;
  
  describe('Basic Testing', () => {
    describe('Empty entities', () => {
      let emptyId: number;
      beforeEach( () => { 
        em = new EntityManager();
        emptyId = em.createEntity().id; 
      });
      it('should create an empty entity', () => {
        
        expect(em.count()).toEqual(1);
      });
    
      it('should retrieve an entity by id', () => {
        expect(em.exists(emptyId)).toBeTruthy();
        expect(() => em.get(emptyId)).not.toThrow();
        expect(() => em.get(-1)).toThrow();
      });
    
      it('should remove an empty entity', () => {
        expect(em.remove(emptyId)).toBeTruthy();
        expect(() => em.get(emptyId)).toThrow();
      });

      it('should indicate failure when remove is run on an entity id that does not exist', () => {
        expect(em.remove(ID_NOT_EXIST)).toBe(false);
      });

      it('should clear out all existing state when desired', () => {
        em.clear();
        expect( () => em.get(emptyId) ).toThrow();
      });
    });
  
    describe('Component initialised entities', () => {
      let initialisedId: number;
      beforeEach( () => {
        em = new EntityManager();
        initialisedId = em.createEntity(
          new Position({x: 7, y: 7}), 
          new Physical(Size.FILL)
        ).id;
      });

      it('Creates entity with component list', () => {
        expect(() => em.get(initialisedId)).not.toThrow();
        expect(em.matchingIds(Position)).toContain(initialisedId);
        expect(em.matchingIds(Physical)).toContain(initialisedId);
        expect(em.matchingIds(Physical, Position)).toContain(initialisedId);
      });
    
      it('Removes component list entity', () => {
        expect(em.remove(initialisedId)).toBeTruthy();
        expect(() => em.get(initialisedId)).toThrow();
        expect(em.matchingIds(Position)).not.toContain(initialisedId);
        expect(em.matchingIds(Physical)).not.toContain(initialisedId);
        expect(em.matchingIds(Physical, Position)).not.toContain(initialisedId);
      });
    })
  
    describe('Manually creating components on entities', () => {
      let manualId: number;
      beforeEach( () => {
        em = new EntityManager();
        manualId = em.createEntity().id;
        em.setComponent(manualId, new Position({x: 1, y: 1}));
      });

      it('Creates entity by setting components manually' , () => {
        expect(() => em.get(manualId)).not.toThrow();
        expect(em.matchingIds(Position)).toContain(manualId);
        expect(em.get(manualId).has(Position));
      });

      it('should throw when setting a component on an entity that does not exist', () => {
        expect( () => em.setComponent(ID_NOT_EXIST, new Position({x: 0, y: 0})) ).toThrow();
      });

      it('should throw when removing a component from an entity that does not exist', () => {
        expect( () => em.removeComponent(ID_NOT_EXIST, Position) ).toThrow();
      });

      it('should remove a component from an entity', () => {
        expect( em.removeComponent(manualId, Position) ).toBe(true);
        expect( em.get(manualId).has(Position) ).toBe(false);
        expect( em.removeComponent(manualId, Renderable) ).toBe(false);
      });

      it('should check whether a component exists on an entity', () => {
        expect( em.hasComponent(manualId, Position) ).toBe(true);
        expect( em.hasComponent(manualId, Renderable) ).toBe(false);
        expect( () => em.hasComponent(ID_NOT_EXIST, Position) ).toThrow();
      });
    
      it('Removes manual entity', () => {
        expect(em.remove(manualId)).toBeTruthy();
        expect(() => em.get(manualId)).toThrow();
        expect(em.count()).toEqual(0);
      });

    });
    
  });

  describe('Retrieving entities by component types', () => {
    beforeEach( () => {
      em = new EntityManager();
      em.createEntity(new Position({x: 2, y: 2}) );
      em.createEntity(new Position({x: 3, y: 3}) );
      em.createEntity(new Renderable('', 1) );
      em.createEntity(new Physical(Size.FILL), new Position({x: 11, y: 11}));
    });

    it('Provides entities with 1 matching components', () => {
      const posEntities = em.matching(Position);
      expect(posEntities.length).toEqual(3);
    });

    it('Provides entities with 1 matching components again', () => {
      const visEntities = em.matching(Renderable);
      expect(visEntities.length).toEqual(1);
    });

    it('Provides entities with 2 matching components', () => {
      const visEntities = em.matching(Position, Physical);
      expect(visEntities.length).toEqual(1);
    });

    it(`Provides entities that don't exist`, () => {
      const emptyEntities = em.matching(MoveTo);
      expect(emptyEntities.length).toEqual(0);
    });

    it('Replaces a component on an entity', () => {
      const id = em.createEntity(new Position({x: 5, y: 5})).id;
      em.setComponent(id, new Position({x: 2, y: 2}));
      expect( coord2.equals(em.get(id).component(Position), new Position({x: 2, y: 2})) ).toBe(true);
    });

  });

  describe('Using indexed component values to retrieve entities', () => {
    let id1: number, id2: number, id3: number, id4: number;

    beforeEach( () => {
      em = new EntityManager();
      em.indexBy(Position);
      id1 = em.createEntity(new Position({x: 0, y: 0})).id;
      em.setComponent(id1, new Position({x: 1, y: 1}));
      id2 = em.createEntity(new Position({x: 2, y: 2})).id;
      id3 = em.createEntity(new Position({x: 3, y: 3})).id;
      id4 = em.createEntity(new Position({x: 1, y: 1})).id;

    });

    it('should indicate the number of existing entities with component when triggering indexing', () => {
      const indexEm = new EntityManager();
      indexEm.createEntity(new Position({x: 2, y: 2}));
      indexEm.createEntity(new Position({x: 3, y: 3}));
      indexEm.createEntity(new Position({x: 1, y: 1}));
      indexEm.createEntity(new Position({x: 1, y: 1}));
      expect(indexEm.indexBy(Position)).toEqual({uniqueComponentValues: 3, totalComponents: 4});
    });

    it('should get the number of entities with a component value', () => {
      expect(em.countIndex(new Position({x: 0, y: 0}))).toEqual(0);
      expect(em.countIndex(new Position({x: 1, y: 1}))).toEqual(2);
      expect(em.countIndex(new Position({x: 2, y: 2}))).toEqual(1);
      expect(em.countIndex(new Position({x: 3, y: 3}))).toEqual(1);

      expect(() => em.countIndex(new Renderable('aoeu', 1))).toThrow();

    });

    it('Retrieves entity by component value', () => {
      expect(em.matchingIndex(new Position({x: 0, y: 0})).length).toEqual(0);
      expect(em.matchingIndex(new Position({x: 1, y: 1})).map( (e: Entity) => e.id)).toContain(id1);
      expect(em.matchingIndex(new Position({x: 1, y: 1})).map( (e: Entity) => e.id)).toContain(id4);
      expect(em.matchingIndex(new Position({x: 2, y: 2})).map( (e: Entity) => e.id)).toContain(id2);
      expect(em.matchingIndex(new Position({x: 3, y: 3})).map( (e: Entity) => e.id)).toContain(id3);

      expect(() => em.matchingIndex(new Renderable('aoeu', 1))).toThrow();
    });

    it('Verifies if that an entity has as index value', () => {
      expect(em.hasIndex(id1, new Position({x: 1, y: 1}))).toEqual(true);
      expect(em.hasIndex(id2, new Position({x: 2, y: 2}))).toEqual(true);
      expect(em.hasIndex(id3, new Position({x: 3, y: 3}))).toEqual(true);
      expect(em.hasIndex(id4, new Position({x: 1, y: 1}))).toEqual(true);
      expect(em.hasIndex(id4, new Position({x: 21, y: 99}))).toEqual(false);

      expect(() => em.hasIndex(id4, new Renderable('aoeu', 1))).toThrow();
    });

    it ('Retrieves by component value that was replaced', () => {
      let changed = em.createEntity(new Position({x: 5, y: 5}));
      em.setComponent(changed.id, new Position({x: 6, y: 6}));
      expect(em.matchingIndex(new Position({x: 5, y: 5})).length).toEqual(0);
    });

    it('Retrieves by component that replaces an old one', () => {
      let changed = em.createEntity(new Position({x: 5, y: 5}));
      em.setComponent(changed.id, new Position({x: 6, y: 6}));
      expect(em.matchingIndex(new Position({x: 6, y: 6})).length).toEqual(1);
    })

    it('should throw when trying to retrieve by index when the component type is not set up for indexing', () => {
      class NotIndexed extends Component {};
      expect( () => em.matchingIndex(new NotIndexed()) ).toThrow();
    });
  });

  describe('Executing a lambda on matching components', () => {
    beforeAll( () => {
      em = new EntityManager();
      em.createEntity(new Position({x: 1, y: 5}));
      em.createEntity(new Position({x: 1, y: 7}));
      em.createEntity(new Position({x: 1, y: 9}), new Renderable('aoeu', 1) );
      em.createEntity(new Renderable('uudd', 0), new Physical(Size.FILL) );
      em.createEntity(new Renderable('uudd', 0), new Physical(Size.FILL), new Position({x: 1, y: 1}));
    });

    it('executes lambda on NO matching components', () => {
      let count = 0;
      em.each((e: Entity, m: MoveTo) => ++count, MoveTo );
      expect(count).toEqual(0);
    });

    it('executes lambda on one matching components and one non existent component', () => {
      let count = 0;
      em.each((e: Entity, p: Position, m: MoveTo) => ++count, Position, MoveTo );
      expect(count).toEqual(0);
    });

    it('executes lambda on one matching component', () => {
      let count = 0;
      em.each((e: Entity, p: Position) => ++count, Position );
      expect(count).toEqual(4);
    });

    it('executes lambda on one matching component AND accesses component', () => {
      let count = 0;
      em.each((e: Entity, p: Position) => {
        ++count;
        expect(p.x).toEqual(1);
      }, 
      Position);
      expect(count).toEqual(4);
    });

    it('executes lambda on two matching components', () => {
      let count = 0;
      em.each((e: Entity, p: Position, r: Renderable) => {
        ++count;
      }, Position, Renderable);
      expect(count).toEqual(2);
    });

    it('executes lambda on three matching components', () => {
      let count = 0;
      em.each( (e: Entity, p: Position, r: Renderable, y: Physical) => ++count, Position, Renderable, Physical);
      expect(count).toEqual(1);
    });
  });

  describe('Notifications for create, update or delete of component type', () => {
    let triggered: boolean;
    let existingId: number;
    beforeEach(() => {
      em = new EntityManager();
      existingId = em.createEntity( new Position({x: 1, y: 1}) ).id;
      triggered = false;
    });

    it('Receives notification from create entity', () => {
      em.monitorComponentType(Position, (change: ComponentChange<Position>) => {
        expect(change.id).not.toBeUndefined();
        expect(change.c).not.toBeUndefined();
        expect(change.e).not.toBeUndefined();
        triggered = true;
      });
      em.createEntity( new Position({x: 0, y: 0}) );
      expect(triggered).toBeTruthy();
    });

    it('Receives notification from remove entity with component', () => {
      em.monitorComponentType(Position, (change: ComponentChange<Position>) => {
        expect(change.id).toEqual(existingId);
        expect(change.c).toBeUndefined();
        expect(change.e).toBeUndefined();
        triggered = true;
      });
      em.remove(existingId);
      expect(triggered).toBeTruthy();
    });

    it('Receives notifications from add component', () => {
      const match = `match this`;
      em.monitorComponentType(Renderable, (change: ComponentChange<Renderable>) => {
        expect(change.id).toEqual(existingId);
        expect(change.c!.image).toEqual(match);
        expect(change.e).not.toBeUndefined();
        triggered = true;
      });
      em.setComponent(existingId, new Renderable(match, 0));
      expect(triggered).toBeTruthy();
    });

    it('Receives notification from remove component', () => {
      em.monitorComponentType(Position, (change: ComponentChange<Position>) => {
        expect(change.id).toEqual(existingId);
        expect(change.c).toBeUndefined();
        expect(change.e).not.toBeUndefined();
        triggered = true;
      });
      em.removeComponent(existingId, Position);
      expect(triggered).toBeTruthy();
    });
  });

  describe('Notifications for changes to entity', () => {
    let monitorId: number;
    let triggered: boolean;
    beforeEach(() => {
      em = new EntityManager();
      monitorId = em.createEntity(new Position({x: 1, y: 2})).id;
      triggered = false;
    });

    it('receives notifications on set component', () => {
      em.monitor(monitorId, (e: Entity | null) => {
        expect(e).not.toBeUndefined();
        expect(e!.component(Position).x).toEqual(3);
        triggered = true;
      });
      em.setComponent(monitorId, new Position({x: 3, y: 7}));
      expect(triggered).toBeTruthy();
    });
    
    it('receives notification on component removal', () => {
      em.monitor(monitorId, (e: Entity | null) => {
        expect(e).not.toBeUndefined();
        expect(e!.has(Position)).toBeFalsy();
      });
      em.removeComponent(monitorId, Position);
    });

    it('receives notification on entity remove', () => {
      em.monitor(monitorId, (e: Entity | null) => {
        expect(e).toBeUndefined();
      });
      em.remove(monitorId);
    });

  });

  describe('Handling for named entities', () => {

    beforeEach(() => {
      em = new EntityManager();
    });

    it('should create and retrieve an entity by name', () => {
      const namedEnt = em.createNamedEntity('entityName', 
        new Position({x: 1, y: 1})
      );
      expect(em.getNamed('entityName')).toEqual(namedEnt);
    });

    it('should create by name and retrieve with id', () => {
      const namedEnt = em.createNamedEntity('entityName',
        new Position({x: 1, y: 1})
      );
      expect(em.get(namedEnt.id)).toEqual(namedEnt);
    });

    it('should throw if there is an attempt to get an entity with a name that does not exist', () => {
      expect( () => em.getNamed('some-name-that-has-not-been-registered')).toThrow();
    });

    it('should throw if there is an attempt to create an entity with a name that already exists', () => {
      const repeatedName = 'entityName';
      em.createNamedEntity(repeatedName,
        new Position({x: 1, y: 1})
      );
      expect(() => em.createNamedEntity(repeatedName, new Position({x: 2, y: 2}))).toThrow();
    });

    it('should include named entity components in normal iterations', () => {
      em.createNamedEntity('entityName',
        new Position({x: 1, y: 1})
      );
      let count = 0;
      em.each((e , p) => {
        ++count;
      }, Position);
      expect(count).toEqual(1);
    });

    it('should remove a named entity by id', () => {
      const id = em.createNamedEntity('entityName',
        new Position({x: 1, y: 1})
      ).id;
      em.remove(id);
      expect(() => em.getNamed('entityName')).toThrow();
    });

    it('should remove a named entity by name', () => {
      em.createNamedEntity('entityName',
        new Position({x: 1, y: 1})
      ).id;
      em.removeNamed('entityName');
      expect(() => em.getNamed('entityName')).toThrow();
    });

    it('should indicate failure when removing an entity by a name that does not exist', () => {
      expect( em.removeNamed('name-that-does-not-exist') ).toBe(false);
    });

    it('should set a component on a named entity', () => {
      em.createNamedEntity('entityName');
      em.setComponent('entityName', new Position({x: 7, y: 7}));
      expect(em.getNamed('entityName').component(Position)).toEqual(new Position({x: 7, y: 7}));
    });

    it('should fail to set a component on entities that do not exist', () => {
      expect( () => em.setComponent('does-not-exist', new Position({x: 7, y: 7})) ).toThrow();
      expect( () => em.setComponent(999999, new Position({x: 7, y: 7})) ).toThrow();
    });

    it('should remove a component from a named entity', () => {
      em.createNamedEntity('entityName', new Position({x: 7, y: 7}));
      em.removeComponent('entityName', Position);
      expect(() => em.getNamed('entityName').component(Position)).toThrow();
    });

    it('should monitor a named entity', () => {
      let triggered = false;
      em.createNamedEntity('entityName');
      em.monitorNamed('entityName', (e: Entity | null) => {
        expect(e).not.toBeUndefined();
        expect(e!.component(Position).x).toEqual(1);
        triggered = true;
      });
      em.setComponent('entityName', new Position({x: 1, y: 1}));
      expect(triggered).toBeTruthy();
    });

    it('should throw when trying to monitor a named entity that does not exist', () => {
      expect( () => em.monitorNamed('does-not-exist', () => {}) ).toThrow();
    });
  });

  describe('Whole ECS serialisation', () => {
    it('should produce a data representation of the simplest ECS state', () => {
      const em = new EntityManager();
      em.createEntity(new Position({x: 1, y: 1}));
      expect(em.toData()).toEqual(SIMPLEST_ECS_DATA());
    });

    it('should produce a representation of an ECS that indexes on a component type', () => {
      const em = new EntityManager();
      em.indexBy(Position);
      expect(em.toData()).toEqual({
        indexed: ['Position'],
        entities: {}
      });
    });

    it('should initialise from simple data', () => {
      const em = new EntityManager();
      const id = 0;
      em.fromData(
        SIMPLEST_ECS_DATA(),
        { Position: Position }
      );

      expect( em.get(id).has(Position) ).toBe(true);
      expect( coord2.equals(em.get(id).component(Position), new Position({x: 1, y: 1}) ) );
      expect( em.get(id).component(Position) instanceof Position ).toBe(true);
    });

    it('should roundtrip simple ECS data', () => {
      const fromEm = new EntityManager();
      const id = fromEm.createEntity(new Position({x: 1, y: 1})).id;
      const data = fromEm.toData();

      const toEm = new EntityManager();
      toEm.fromData(data, {Position});
      expect( coord2.equals(toEm.get(id).component(Position), new Position({x: 1, y: 1}) ) );
    });

    it('should fail to initialise from data if a component in the data does not have a type provided', () => {
      const em = new EntityManager();
      expect( () => em.fromData(SIMPLEST_ECS_DATA(), {}) ).toThrow(); 
    });

    it('should not overwrite entities when creating manually after initialising from data', () => {
      const em = new EntityManager();
      em.fromData(
        SIMPLEST_ECS_DATA(),
        { Position: Position }
      );

      const newId = em.createEntity( new Position({x: 7 , y: 7}) ).id;
      expect( newId ).not.toBe(0);
    });

    it('should not retain any existing entities after initialisation from data', () => {
      const em = new EntityManager();
      const id = em.createEntity(new Position({x: 1, y: 1})).id;
      em.fromData({indexed: [], entities: {}}, {});
      expect( () => em.get(id) ).toThrow();
    });

    it('should fail if component to index by is not included in the type index', () => {
      const em = new EntityManager();
      expect( () => em.fromData(
        { indexed: ['Something'], entities: {}, },
        {}
      )).toThrow();
    });

    it('should allow retrieval by index after initialisation from data', () => {
      const data = {
        indexed: ['Position'],
        entities: {
          0: { Position: {x: 7, y: 7} },
          1: { Position: {x: 7, y: 7} },
          2: { Position: {x: 3, y: 3} },
        }
      };
      const em = new EntityManager();
      em.fromData(data, { Position });
      
      expect(em.matchingIndex( new Position({x: 7, y: 7}) ).length).toEqual(2);
      expect(em.matchingIndex( new Position({x: 3, y: 3}) ).length).toEqual(1);
      expect(em.matchingIndex( new Position({x: 1, y: 1}) ).length).toEqual(0);
    });
  });
});

describe('Entity', () => {
  let e: Entity;
  beforeAll(() => {
    e = new Entity(-1, [new Position({x: 5, y: 5}), new Physical(Size.FILL)]);
  });

  it('Reports existence of components', () => {
    expect(e.has( [Position] )).toBeTruthy();
    expect(e.has( [Physical] )).toBeTruthy();
    expect(e.has( [Renderable] )).toBeFalsy();
  });

  it('Retrieves one component AND accesses', () => {
    let [c] = e.components(Position);
    expect(c.x).toEqual(5);
  });

  it('Retrieves two components AND accesses their data', () => {
    let [p, y] = e.components(Position, Physical);
    expect(p.x).toEqual(5);
    expect(y.size).toEqual(Size.FILL);
  });

});
