import { seededShuffle } from "../shared";
import type { CubeCatalog, CubeDimension, CubeMeasure } from "../types";

import { TYPE_PRIOR } from "./constants";

/**
 * PLACEHOLDER: random measure order, seeded by table id so reloads are stable.
 * Replace (or add a variant) once a real measure signal exists.
 */
export function rankMeasures(catalog: CubeCatalog): CubeMeasure[] {
  const byId = [...catalog.measures].sort((a, b) => a.id - b.id);
  return seededShuffle(byId, catalog.tableId);
}

export function compareDimensions(a: CubeDimension, b: CubeDimension) {
  return (
    b.score * TYPE_PRIOR[b.type] - a.score * TYPE_PRIOR[a.type] ||
    a.key.localeCompare(b.key)
  );
}
