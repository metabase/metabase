// NOTE: we currently use object's `model` property for the drag type
export function dragTypeForItem(item) {
  return item.model;
}

export const DragTypes = {
  QUESTION: "card", // a.k.a. question
  DASHBOARD: "dashboard",
  COLLECTION: "collection",
  PULSE: "pulse",
};

export const PinnableDragTypes = [DragTypes.QUESTION, DragTypes.DASHBOARD];

export const MoveableDragTypes = [
  DragTypes.QUESTION,
  DragTypes.DASHBOARD,
  DragTypes.COLLECTION,
  DragTypes.PULSE,
];
