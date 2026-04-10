import { getObjectEntries } from "metabase/utils/objects";

import type {
  MetricSourceId,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
} from "../types/viewer-state";

import type { MetricSlot } from "./metric-slots";
import { computeMetricSlots } from "./metric-slots";

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

/**
 * Remap dimension mappings using a precomputed old→new slot index mapping
 * (produced by `applyTrackedDefinitions`).  This is the fast path used when
 * the slot mapping is available from CodeMirror position tracking.
 *
 * 1. Remap existing entries via the slot mapping (simple lookup).
 * 2. Inherit sibling dimensions for unmapped new slots.
 */
export function remapDimensionMappings(
  tabs: MetricsViewerTabState[],
  slotMapping: Map<number, number>,
  newEntities: MetricsViewerFormulaEntity[],
): MetricsViewerTabState[] {
  const newSlots = computeMetricSlots(newEntities);

  return tabs.map((tab) => {
    const newMapping: Record<number, string | null> = {};
    let changed = false;

    // 1. Remap existing entries from old slot index → new slot index
    for (const [oldKey, dimId] of getObjectEntries(tab.dimensionMapping)) {
      const oldSlotIndex = Number(oldKey);
      const newSlotIndex = slotMapping.get(oldSlotIndex);
      if (newSlotIndex == null) {
        changed = true;
        continue; // slot was removed
      }
      if (newSlotIndex !== oldSlotIndex) {
        changed = true;
      }
      newMapping[newSlotIndex] = dimId;
    }

    // 2. Inherit sibling dimensions for unmapped new slots
    for (const slot of newSlots) {
      if (slot.slotIndex in newMapping) {
        continue;
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
