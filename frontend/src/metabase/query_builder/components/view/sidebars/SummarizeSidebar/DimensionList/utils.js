import _ from "underscore";

export const getItemName = (item, shouldIncludeTable) => {
  const dimensionName = item.name ?? item.dimension?.displayName();

  if (!shouldIncludeTable) {
    return dimensionName;
  }

  const field = item.dimension?.field?.();
  const tableName = field?.table?.displayName();

  return `${tableName} → ${dimensionName}`;
};

export const getItemIcon = item => item.icon ?? item.dimension?.icon();

export const getSelectedSubDimensionName = (dimension, dimensions) => {
  const subDimension =
    _.find(dimensions, d => d.isSameBaseDimension(dimension)) ||
    dimension.defaultDimension();
  return subDimension?.subTriggerDisplayName();
};

export const excludePinnedItems = (items, pinnedItems) =>
  items.filter(item => {
    const isPinned = pinnedItems.some(pinnedItem =>
      pinnedItem.dimension.isEqual(item.dimension),
    );

    return !isPinned;
  });

export const filterItems = (items, filter) => {
  const trimmedFilter = filter.trim().toLowerCase();
  return items.filter(item =>
    getItemName(item).toLowerCase().includes(trimmedFilter),
  );
};
