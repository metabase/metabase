import PropTypes from "prop-types";
import { t } from "ttag";

import CheckBox from "metabase/core/components/CheckBox";
import BaseTableItem from "./BaseTableItem";
import {
  ColumnHeader,
  Table,
  SortingIcon,
  SortingControlContainer,
  TBody,
  LastEditedByCol,
  BulkSelectWrapper,
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
  databases: PropTypes.arrayOf(PropTypes.object),
  bookmarks: PropTypes.arrayOf(PropTypes.object),
  createBookmark: PropTypes.func,
  deleteBookmark: PropTypes.func,
  items: PropTypes.arrayOf(PropTypes.object),
  collection: PropTypes.object,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  hasUnselected: PropTypes.bool,
  isPinned: PropTypes.bool,
  renderItem: PropTypes.func,
  sortingOptions: sortingOptsShape,
  onSortingOptionsChange: PropTypes.func,
  onToggleSelected: PropTypes.func,
  onSelectAll: PropTypes.func,
  onSelectNone: PropTypes.func,
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
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  items,
  collection = {},
  selectedItems,
  hasUnselected,
  isPinned,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onDrop,
  sortingOptions,
  onSortingOptionsChange,
  onToggleSelected,
  onSelectAll,
  onSelectNone,
  getIsSelected = () => false,
  headless = false,
  ...props
}) {
  const itemRenderer = item =>
    renderItem({
      databases,
      bookmarks,
      createBookmark,
      deleteBookmark,
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

  const canSelect = collection.can_write || false;

  return (
    <Table canSelect={canSelect} {...props}>
      <colgroup>
        {canSelect && <col style={{ width: "70px" }} />}
        <col style={{ width: "70px" }} />
        <col />
        <LastEditedByCol />
        <col style={{ width: "140px" }} />
        <col style={{ width: "100px" }} />
      </colgroup>
      {!headless && (
        <thead
          data-testid={
            isPinned ? "pinned-items-table-head" : "items-table-head"
          }
        >
          <tr>
            {canSelect && (
              <ColumnHeader>
                <BulkSelectWrapper>
                  <CheckBox
                    checked={selectedItems?.length > 0 || false}
                    indeterminate={
                      (selectedItems?.length > 0 && hasUnselected) || false
                    }
                    onChange={hasUnselected ? onSelectAll : onSelectNone}
                    aria-label={t`Select all items`}
                  />
                </BulkSelectWrapper>
              </ColumnHeader>
            )}
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
      <TBody>{items.map(itemRenderer)}</TBody>
    </Table>
  );
}

export default BaseItemsTable;
