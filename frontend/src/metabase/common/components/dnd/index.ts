// NOTE: we currently use object's `model` property for the drag type
import type { CollectionItem } from "metabase-types/api";

export interface ItemDragPayload {
  items: CollectionItem[];
}

export function isItemDragPayload(
  payload: unknown,
): payload is ItemDragPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "items" in payload &&
    Array.isArray(payload.items)
  );
}

export function dragTypeForItem(item: CollectionItem) {
  return item.model;
}

export const DND_IGNORE_CLASS_NAME = "dnd-ignore";

export const DragTypes = {
  QUESTION: "card", // a.k.a. question
  DASHBOARD: "dashboard",
  COLLECTION: "collection",
  PULSE: "pulse",
  DATASET: "dataset",
  METRIC: "metric",
  DOCUMENT: "document",
  EXPLORATION: "exploration",
};

export const PinnableDragTypes = [
  DragTypes.QUESTION,
  DragTypes.DASHBOARD,
  DragTypes.PULSE,
  DragTypes.DATASET,
  DragTypes.METRIC,
  DragTypes.DOCUMENT,
  DragTypes.EXPLORATION,
];

export const MoveableDragTypes = [
  DragTypes.QUESTION,
  DragTypes.DASHBOARD,
  DragTypes.COLLECTION,
  DragTypes.PULSE,
  DragTypes.DATASET,
  DragTypes.METRIC,
  DragTypes.DOCUMENT,
  DragTypes.EXPLORATION,
];
