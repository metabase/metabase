import { Undo } from "../undo";

export const createMockUndoState = (undos: Undo[] = []) => {
  return [...undos];
}