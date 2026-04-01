import { getObjectEntries } from "metabase/lib/objects";

import type {
  MetricSourceId,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
} from "../types/viewer-state";

import type { MetricSlot } from "./metric-slots";
import { computeMetricSlots } from "./metric-slots";

/**
 * Compute a stable identity string for a slot, used to match old ↔ new across
 * formula-entity list changes.
 *
 * - Standalone metric slots: `m:<sourceId>:<occurrence>` (occurrence counted
 *   among standalone slots with the same sourceId).
 * - Expression token slots: `x:<expressionEntityId>:<tokenPosition>`.
 */
function computeSlotIdentities(
  slots: MetricSlot[],
  entities: MetricsViewerFormulaEntity[],
): string[] {
  const standaloneCounts = new Map<string, number>();
  return slots.map((slot) => {
    if (slot.tokenPosition === undefined) {
      const key = `m:${slot.sourceId}`;
      const nth = (standaloneCounts.get(key) ?? 0) + 1;
      standaloneCounts.set(key, nth);
      return `${key}:${nth}`;
    }
    const entity = entities[slot.entityIndex];
    const exprId = entity?.type === "expression" ? entity.id : "unknown";
    return `x:${exprId}:${slot.tokenPosition}`;
  });
}

/**
 * When formulaEntities change (add/remove/reorder), dimensionMapping keys
 * (slot indices) may become stale.  This function rebuilds each tab's
 * dimensionMapping so that:
 *
 * 1. Existing entries are remapped to the correct (possibly shifted) slot index.
 * 2. *New* slots that share a sourceId with an already-mapped slot inherit
 *    the same dimensionId — so adding a second "Revenue" metric or a new
 *    expression token referencing "Revenue" automatically gets the tab's
 *    existing dimension for "Revenue".
 */
export function reconcileDimensionMappings(
  tabs: MetricsViewerTabState[],
  oldEntities: MetricsViewerFormulaEntity[],
  newEntities: MetricsViewerFormulaEntity[],
): MetricsViewerTabState[] {
  const oldSlots = computeMetricSlots(oldEntities);
  const newSlots = computeMetricSlots(newEntities);

  // ── Build identity maps ──

  const oldIdentities = computeSlotIdentities(oldSlots, oldEntities);
  const newIdentities = computeSlotIdentities(newSlots, newEntities);

  // old identity → old slot index
  const oldIdentityToSlotIndex = new Map<string, number>();
  for (let i = 0; i < oldSlots.length; i++) {
    oldIdentityToSlotIndex.set(oldIdentities[i], oldSlots[i].slotIndex);
  }

  // new identity → new slot index
  const newIdentityToSlotIndex = new Map<string, number>();
  for (let i = 0; i < newSlots.length; i++) {
    newIdentityToSlotIndex.set(newIdentities[i], newSlots[i].slotIndex);
  }

  // ── Reconcile each tab ──

  return tabs.map((tab) => {
    const newMapping: Record<number, string | null> = {};
    let changed = false;

    // 1. Remap existing entries from old slot index → new slot index
    for (const [oldKey, dimId] of getObjectEntries(tab.dimensionMapping)) {
      const oldSlotIndex = Number(oldKey);
      const oldIdentity = oldIdentities[oldSlotIndex];
      if (!oldIdentity) {
        changed = true;
        continue; // slot no longer exists
      }
      const newSlotIndex = newIdentityToSlotIndex.get(oldIdentity);
      if (newSlotIndex == null) {
        changed = true;
        continue; // this slot was removed
      }
      if (newSlotIndex !== oldSlotIndex) {
        changed = true;
      }
      newMapping[newSlotIndex] = dimId;
    }

    // 2. For any new slot not yet in the mapping, check if another
    //    slot with the same sourceId already has a dimension in this tab.
    //    If so, inherit it — this handles the "add second Revenue" case
    //    and expression tokens referencing already-mapped metrics.
    for (const slot of newSlots) {
      if (slot.slotIndex in newMapping) {
        continue; // already mapped
      }
      const siblingDimId = findSiblingDimension(
        newMapping,
        newSlots,
        slot.sourceId,
      );
      if (siblingDimId !== undefined) {
        newMapping[slot.slotIndex] = siblingDimId;
        changed = true;
      }
    }

    return changed ? { ...tab, dimensionMapping: newMapping } : tab;
  });
}

/**
 * Look through the already-remapped entries for a slot with the same
 * sourceId and return its dimension id.
 */
function findSiblingDimension(
  mapping: Record<number, string | null>,
  slots: MetricSlot[],
  targetSourceId: MetricSourceId,
): string | null | undefined {
  for (const [idxStr, dimId] of Object.entries(mapping)) {
    const idx = Number(idxStr);
    const slot = slots.find((s) => s.slotIndex === idx);
    if (slot && slot.sourceId === targetSourceId) {
      return dimId;
    }
  }
  return undefined; // no sibling found — leave unmapped
}
