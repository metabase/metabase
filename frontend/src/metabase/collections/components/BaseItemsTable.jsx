import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import BaseTableItem from "./BaseTableItem";
import {
  ColumnHeader,
  Table,
  SortingIcon,
  SortingControlContainer,
} from "./BaseItemsTable.styled";

const sortingOptsShape = PropTypes.shape({
  sort_column: PropTypes.string.isRequired,
  sort_direction: PropTypes.oneOf(["asc", "desc"]).isRequired,
});

SortableColumnHeader.propTypes = {
  name: PropTypes.string.isRequired,
  sortingOptions: sortingOptsShape.isRequired,
  onSortingOptionsChange: PropTypes.func.isRequired,
  children: PropTypes.node,
};

function SortableColumnHeader({
  name,
  sortingOptions,
  onSortingOptionsChange,
  children,
  ...props
}) {
  const isSortingThisColumn = sortingOptions.sort_column === name;
  const direction = isSortingThisColumn
    ? sortingOptions.sort_direction
    : "desc";

  const onSortingControlClick = () => {
    const nextDirection = direction === "asc" ? "desc" : "asc";
    onSortingOptionsChange({
      sort_column: name,
      sort_direction: nextDirection,
    });
  };

  return (
    <ColumnHeader>
      <SortingControlContainer
        {...props}
        isActive={isSortingThisColumn}
        onClick={onSortingControlClick}
        role="button"
      >
        {children}
        <SortingIcon name={direction === "asc" ? "chevronup" : "chevrondown"} />
      </SortingControlContainer>
    </ColumnHeader>
  );
}

BaseItemsTable.Item = BaseTableItem;

BaseItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  collection: PropTypes.object,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  isPinned: PropTypes.bool,
  renderItem: PropTypes.func,
  sortingOptions: sortingOptsShape,
  onSortingOptionsChange: PropTypes.func,
  onToggleSelected: PropTypes.func,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  getIsSelected: PropTypes.func,

  // Used for dragging
  headless: PropTypes.bool,
};

function defaultItemRenderer({ item, ...props }) {
  return (
    <BaseTableItem key={`${item.model}-${item.id}`} item={item} {...props} />
  );
}

function BaseItemsTable({
  items,
  collection = {},
  selectedItems,
  isPinned,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onDrop,
  sortingOptions,
  onSortingOptionsChange,
  onToggleSelected,
  getIsSelected = () => false,
  headless = false,
  ...props
}) {
  const itemRenderer = item =>
    renderItem({
      item,
      collection,
      selectedItems,
      isSelected: getIsSelected(item),
      isPinned,
      onCopy,
      onMove,
      onDrop,
      onToggleSelected,
    });

  return (
    <Table {...props}>
      <colgroup>
        <col style={{ width: "70px" }} />
        <col />
        <col style={{ width: "140px" }} />
        <col style={{ width: "140px" }} />
        <col style={{ width: "60px" }} />
      </colgroup>
      {!headless && (
        <thead
          data-testid={
            isPinned ? "pinned-items-table-head" : "items-table-head"
          }
        >
          <tr>
            <SortableColumnHeader
              name="model"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
              style={{ marginLeft: 6 }}
            >
              {t`Type`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="name"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Name`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="last_edited_by"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Last edited by`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="last_edited_at"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Last edited at`}
            </SortableColumnHeader>
            <th></th>
          </tr>
        </thead>
      )}
      <tbody>{items.map(itemRenderer)}</tbody>
    </Table>
  );
}

export default BaseItemsTable;
