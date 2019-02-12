
import { EntityManager } from './entity-manager';

export interface System {
  update: (em: EntityManager) => void;
}
