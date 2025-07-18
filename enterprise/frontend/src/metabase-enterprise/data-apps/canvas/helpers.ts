import type { DataAppWidget, WidgetId } from "./canvas-types";

export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const newArray = array.slice();
  newArray.splice(
    to < 0 ? newArray.length + to : to,
    0,
    newArray.splice(from, 1)[0],
  );

  return newArray;
}

// a little function to help us with reordering the result
export const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed); // inserting task in new index

  return result;
};

export const remove = (arr, index) => [
  // part of the array before the specified index
  ...arr.slice(0, index),
  // part of the array after the specified index
  ...arr.slice(index + 1),
];

export const insert = (arr, index, newItem) => [
  // part of the array before the specified index
  ...arr.slice(0, index),
  // inserted item
  newItem,
  // part of the array after the specified index
  ...arr.slice(index),
];

export const findParent = (
  id: WidgetId,
  components: DataAppWidget[],
): DataAppWidget => {
  const parent = components.find((item) =>
    item.childrenIds?.includes(id as WidgetId),
  ); // TODO: optimize complexity

  return parent as DataAppWidget;
};

export const handleMoveWithinParent = (
  components: DataAppWidget[],
  item: DataAppWidget,
  index: number,
) => {
  const newComponents = [...components];

  const parent = findParent(item.id, components);
  const parentIndex = newComponents.findIndex((c) => c.id === parent.id);

  if (!parent.childrenIds) {
    console.warn(
      "Failed to find childrenIds for item:",
      newComponents[parentIndex].id,
    );
    return newComponents;
  }

  const itemIndex = parent.childrenIds.indexOf(item.id);

  newComponents[parentIndex] = {
    ...parent,
    childrenIds: arrayMove(parent.childrenIds, itemIndex, index),
  };

  return newComponents;
};

export const handleMoveToDifferentParent = (
  components: DataAppWidget[],
  items: {
    item: DataAppWidget;
    over: DataAppWidget;
  },
  index: number,
) => {
  const { item, over } = items;

  const newComponents = [...components];
  const overIndex = newComponents.findIndex((c) => c.id === over.id);
  const parent = findParent(item.id, components);
  const parentIndex = newComponents.findIndex((c) => c.id === parent.id);

  newComponents[overIndex] = {
    ...newComponents[overIndex],
    childrenIds: insert(
      newComponents[overIndex].childrenIds || [],
      index,
      item.id,
    ),
  };

  newComponents[parentIndex] = {
    ...newComponents[parentIndex],
    childrenIds:
      newComponents[parentIndex].childrenIds?.filter((id) => id !== item.id) ||
      [],
  };

  return newComponents;
};

export const handleMoveSidebarComponentIntoParent = (
  components: DataAppWidget[],
  items: {
    item: DataAppWidget;
    over: DataAppWidget;
  },
  index: number,
) => {
  const { item, over } = items;

  const newComponents = [...components, item];
  const overIndex = newComponents.findIndex((c) => c.id === over.id);

  newComponents[overIndex] = {
    ...newComponents[overIndex],
    childrenIds: insert(
      newComponents[overIndex].childrenIds || [],
      index,
      item.id,
    ),
  };

  return newComponents;
};

export const handleRemoveItemFromLayout = (
  components: DataAppWidget[],
  item: DataAppWidget,
) => {
  const newComponents = components.filter(({ id }) => id !== item.id);

  const parent = findParent(item.id, components);
  const parentIndex = newComponents.findIndex((c) => c.id === parent.id);

  newComponents[parentIndex] = {
    ...newComponents[parentIndex],
    childrenIds:
      newComponents[parentIndex].childrenIds?.filter((id) => id !== item.id) ||
      [],
  };

  return newComponents;
};
