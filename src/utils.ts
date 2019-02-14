
export function setIntersect(left: Set<number>, right: Set<number>): Set<number> {
  return new Set<number>(Array.from(left).filter( (n: number) => right.has(n) ));
};