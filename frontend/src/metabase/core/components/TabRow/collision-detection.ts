import type { CollisionDetection } from "@dnd-kit/core";

export const tabsCollisionDetection: CollisionDetection = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  // This is the same as item as `collisionRect`, but unlike `collectionRect`,
  // which updates in realtime, `activeRect` retains the original properties of
  // the list before dragging. E.g. `collectionRect.right` is the right value of
  // where the user has dragged the tab to, but `activeRect.right` is the right
  // value from where it orginally was.
  const activeRect = droppableRects.get(active.id);
  if (!activeRect) {
    return [];
  }
  const isDraggingRight = collisionRect.right > activeRect.right;

  const sortedContainers = droppableContainers.sort((a, b) => {
    const rectA = droppableRects.get(a.id);
    const rectB = droppableRects.get(b.id);

    // This should never happen, there should be a rect for each container
    if (!rectA || !rectB) {
      return 0;
    }

    if (isDraggingRight) {
      return rectA.right - rectB.right;
    }
    return rectB.left - rectA.left;
  });

  const filteredContainers = sortedContainers.filter(container => {
    if (container.id === active.id) {
      return false;
    }

    const rect = droppableRects.get(container.id);
    // This should never happen, there should be a rect for each container
    if (!rect) {
      return false;
    }

    if (isDraggingRight) {
      return rect.right >= collisionRect.right;
    }
    return rect.left <= collisionRect.left;
  });

  // When dragging a tab to the very right, `filteredContainers` will be empty,
  // so we'll return the rightmost tab from `sortedContainers`.
  const overContainer =
    filteredContainers.length === 0
      ? sortedContainers[sortedContainers.length - 1]
      : filteredContainers[0];

  return [
    {
      id: overContainer.id,
      data: { droppableContainer: overContainer, value: 0 },
    },
  ];
};
