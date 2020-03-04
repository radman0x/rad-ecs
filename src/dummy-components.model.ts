import { Component } from './rad-ecs';

export interface Coord2 {
  x: number;
  y: number;
}

export namespace coord2 {
  export function equals(lhs: Coord2, rhs: Coord2): boolean {
    return rhs.x === lhs.x && rhs.y === lhs.y;
  }

  export function add(lhs: Coord2, rhs: Coord2): Coord2 {
    return { x: lhs.x + rhs.x, y: lhs.y + rhs.y };
  }

  export function addTo(to: Coord2, add: Coord2): void {
    to.x = to.x + add.x;
    to.y = to.y + add.y;
  }

  export function subtract(lhs: Coord2, rhs: Coord2): Coord2 {
    return { x: lhs.x - rhs.x, y: lhs.y - rhs.y };
  }

  export function subtractFrom(from: Coord2, subtract: Coord2): void {
    from.x = from.x - subtract.x;
    from.y = from.y - subtract.y;
  }

  export function magnitude(Coord2: Coord2): number {
    return Math.abs(Math.sqrt(Coord2.x ** 2 + Coord2.y ** 2));
  }
}

export class Position extends Component {
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

export class Renderable extends Component {
  constructor(public image: string, public zOrder: number) {
    super();
  }
}

export enum Size {
  FILL
}

export class Physical extends Component {
  constructor(public size: Size) {
    super();
  }
}

export class MoveTo extends Component {
  constructor(public direction: Coord2) {
    super();
  }
}
