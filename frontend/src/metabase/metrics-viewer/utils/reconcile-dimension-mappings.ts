import { getObjectEntries } from "metabase/lib/objects";

import type {
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
} from "../types/viewer-state";

/**
 * Build a stable identity key for an entity so we can match old ↔ new
 * across formula-entity list changes.
 */
function entityKey(e: MetricsViewerFormulaEntity): string {
  return e.type === "metric" ? `m:${e.id}` : `x:${e.id}`;
}

/**
 * When formulaEntities change (add/remove/reorder), dimensionMapping keys
 * (entity indices) may become stale.  This function rebuilds each tab's
 * dimensionMapping so that:
 *
 * 1. Existing entries are remapped to the correct (possibly shifted) index.
 * 2. *New* entity instances that share an identity with an already-mapped
 *    entity inherit the same dimensionId — so adding a second "Revenue"
 *    metric automatically gets the tab's existing dimension for "Revenue".
 */
export function reconcileDimensionMappings(
  tabs: MetricsViewerTabState[],
  oldEntities: MetricsViewerFormulaEntity[],
  newEntities: MetricsViewerFormulaEntity[],
): MetricsViewerTabState[] {
  // ── Build occurrence maps for old entities ──

  const occurrenceCountOld = new Map<string, number>();
  const oldIndexToOccurrence = new Map<number, { key: string; nth: number }>();

  for (let i = 0; i < oldEntities.length; i++) {
    const key = entityKey(oldEntities[i]);
    const nth = (occurrenceCountOld.get(key) ?? 0) + 1;
    occurrenceCountOld.set(key, nth);
    oldIndexToOccurrence.set(i, { key, nth });
  }

  // ── Build occurrence maps for new entities ──

  const occurrenceCountNew = new Map<string, number>();
  /** "key:nth" → new index */
  const newOccurrenceToIndex = new Map<string, number>();
  /** new index → entity identity key */
  const newIndexToKey = new Map<number, string>();

  for (let i = 0; i < newEntities.length; i++) {
    const key = entityKey(newEntities[i]);
    const nth = (occurrenceCountNew.get(key) ?? 0) + 1;
    occurrenceCountNew.set(key, nth);
    newOccurrenceToIndex.set(`${key}:${nth}`, i);
    newIndexToKey.set(i, key);
  }

  // ── Reconcile each tab ──

  return tabs.map((tab) => {
    const newMapping: Record<number, string | null> = {};
    let changed = false;

    // 1. Remap existing entries from old index → new index
    for (const [oldKey, dimId] of getObjectEntries(tab.dimensionMapping)) {
      const oldIndex = Number(oldKey);
      const occ = oldIndexToOccurrence.get(oldIndex);
      if (!occ) {
        changed = true;
        continue; // entity no longer exists
      }
      const newIndex = newOccurrenceToIndex.get(`${occ.key}:${occ.nth}`);
      if (newIndex == null) {
        changed = true;
        continue; // this occurrence was removed
      }
      if (newIndex !== oldIndex) {
        changed = true;
      }
      newMapping[newIndex] = dimId;
    }

    // 2. For any new entity index not yet in the mapping, check if another
    //    instance of the same metric already has a dimension in this tab.
    //    If so, inherit it — this handles the "add second Revenue" case.
    for (let i = 0; i < newEntities.length; i++) {
      if (i in newMapping) {
        continue; // already mapped
      }
      const key = newIndexToKey.get(i)!;
      // Find an existing mapping entry with the same identity key
      const siblingDimId = findSiblingDimension(newMapping, newIndexToKey, key);
      if (siblingDimId !== undefined) {
        newMapping[i] = siblingDimId;
        changed = true;
      }
    }

    return changed ? { ...tab, dimensionMapping: newMapping } : tab;
  });
}

/**
 * Look through the already-remapped entries for one with the same entity
 * identity key and return its dimension id.
 */
function findSiblingDimension(
  mapping: Record<number, string | null>,
  indexToKey: Map<number, string>,
  targetKey: string,
): string | null | undefined {
  for (const [idxStr, dimId] of Object.entries(mapping)) {
    const idx = Number(idxStr);
    if (indexToKey.get(idx) === targetKey) {
      return dimId;
    }
  }
  return undefined; // no sibling found — leave unmapped
}
