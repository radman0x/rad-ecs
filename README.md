# rad-ecs

An Entity Component System (ECS) library written in TypeScript, bare bones and easy to use.

## Features

This library is heavy on entity creation and management, while being very light on the S (System) part of ECS. What is provided here is a robust entity manager with strong abilities for creation and manipulation of component based entities.

* Entity management
  * Generic creation of entities composed of components
  * Callback based iteration of entities based on component presence
  * Rxjs based event signalling to monitor entity and component changes
  * Indexing by component type to allow quick lookup of all components with a given value e.g get all entities with a position
  * Immutable pattern for updating entities

## Hello world

Simple example showing basic component definition, entity creation and access.

```javascript
import { EntityManager, Component, Entity } from 'rad-ecs';

class HelloWorld extends Component {
  constructor(
    public message: string = "Hello world!"
  ) {
    super();
  }
}

const helloEm = new EntityManager();
const helloEntity = helloEm.createEntity(new HelloWorld());

console.log(`-- Hello World --`);
console.log(helloEm.get(helloEntity.id).component(HelloWorld).message);
```

## Entity iteration based on component

Shows how to iterate all entities that exist  with a given component, or set of components.

```javascript
enum ShapeType {
  CIRCLE = 'circle',
  SQUARE = 'square',
  TRIANGLE = 'triangle'
}

class Shape extends Component {
  constructor(
    public type: ShapeType
  ) {
    super();
  }
}

class Physical extends Component {
  constructor(
    public weight: number,
    public volume: number
  ) {
    super();
  }
}

const em = new EntityManager();

const newEnt = em.createEntity(
  new Shape(ShapeType.TRIANGLE),
  new Physical(10, 100)
);

em.createEntity(
  new Shape(ShapeType.SQUARE)
);

em.createEntity(
  new Physical(1, 5)
);

console.log(`-- Has Shape --`);
em.each( (e: Entity, s: Shape) => {
  console.log(`Entity: ${e.id}, Shape: ${s.type}`);
}, Shape);

console.log(`-- Has Physical --`);
em.each( (e: Entity, p: Physical) => {
  console.log(`Entity: ${e.id}, Physical: weight ${p.weight}, volume: ${p.volume}`);
}, Physical);

console.log(`-- Has Shape & Physical --`);
em.each( (e: Entity, p: Physical, s: Shape) => {
  console.log(`Entity: ${e.id}, Physical: weight ${p.weight}, volume: ${p.volume} - Shape: ${s.type}`);
}, Physical, Shape);
```
