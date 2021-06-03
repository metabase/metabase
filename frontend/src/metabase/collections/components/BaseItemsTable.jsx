import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import moment from "moment";

import { color } from "metabase/lib/colors";

import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import {
  ColumnHeader,
  SortingIcon,
  SortingControlContainer,
  TableItemSecondaryField,
} from "./BaseItemsTable.styled";

export const ROW_HEIGHT = 80;

BaseTableItem.propTypes = {
  item: PropTypes.object.isRequired,
  collection: PropTypes.object,
  isPinned: PropTypes.bool,
  isSelected: PropTypes.bool,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  onToggleSelected: PropTypes.func,
  linkProps: PropTypes.object,
  hasBottomBorder: PropTypes.bool,
  children: PropTypes.node,
};

export function BaseTableItem({
  item,
  collection = {},
  isPinned,
  isSelected,
  selectedItems,
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
  linkProps = {},
  hasBottomBorder = true,
  children,
}) {
  const lastEditInfo = item["last-edit-info"];
  const lastEditedBy = lastEditInfo
    ? `${lastEditInfo.first_name} ${lastEditInfo.last_name}`
    : "";
  const lastEditedAt = lastEditInfo
    ? moment(lastEditInfo.timestamp).format("MMMM DD, YYYY")
    : "";

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handlePin = useCallback(() => {
    item.setPinned(!isPinned);
  }, [item, isPinned]);

  const handleMove = useCallback(() => onMove([item]), [item, onMove]);
  const handleCopy = useCallback(() => onCopy([item]), [item, onCopy]);
  const handleArchive = useCallback(() => item.setArchived(true), [item]);

  const testID = isPinned ? "pinned-collection-entry" : "collection-entry";

  return (
    <ItemDragSource
      item={item}
      collection={collection}
      isSelected={isSelected}
      selected={selectedItems}
      onDrop={onDrop}
    >
      <tr
        data-testid={testID}
        style={{
          height: `${ROW_HEIGHT}px`,
          "border-bottom": hasBottomBorder
            ? `1px solid ${color("bg-medium")}`
            : "none",
        }}
      >
        <td data-testid={`${testID}-type`}>
          <EntityItem.Icon
            item={item}
            variant="list"
            iconName={item.getIcon()}
            pinned={isPinned}
            selectable
            selected={isSelected}
            onToggleSelected={handleSelectionToggled}
            height="3em"
            width="3em"
            mr={0}
          />
        </td>
        <td data-testid={`${testID}-name`}>
          <Link {...linkProps} to={item.getUrl()}>
            <EntityItem.Name name={item.name} />
          </Link>
        </td>
        <td data-testid={`${testID}-last-edited-by`}>
          <TableItemSecondaryField className="text-dark">
            {lastEditedBy}
          </TableItemSecondaryField>
        </td>
        <td data-testid={`${testID}-last-edited-at`}>
          <TableItemSecondaryField className="text-dark">
            {lastEditedAt}
          </TableItemSecondaryField>
        </td>
        <td>
          <EntityItem.Menu
            item={item}
            onPin={collection.can_write ? handlePin : null}
            onMove={
              collection.can_write && item.setCollection ? handleMove : null
            }
            onCopy={item.copy ? handleCopy : null}
            onArchive={
              collection.can_write && item.setArchived ? handleArchive : null
            }
            ANALYTICS_CONTEXT={ANALYTICS_CONTEXT}
          />
        </td>
        {children}
      </tr>
    </ItemDragSource>
  );
}

function getDefaultLinkProps(item) {
  return {
    className: "hover-parent hover--visibility",
    hover: { color: color("brand") },
    "data-metabase-event": `${ANALYTICS_CONTEXT};Item Click;${item.model}`,
  };
}

function defaultItemRenderer({
  item,
  index,
  isPinned,
  isSelected,
  collection,
  onCopy,
  onMove,
  onDrop,
  selectedItems,
  onToggleSelected,
}) {
  return (
    <BaseTableItem
      key={`${item.model}-${item.id}`}
      item={item}
      index={index}
      isPinned={isPinned}
      isSelected={isSelected}
      collection={collection}
      onCopy={onCopy}
      onMove={onMove}
      onDrop={onDrop}
      selectedItems={selectedItems}
      onToggleSelected={onToggleSelected}
      linkProps={getDefaultLinkProps(item)}
    />
  );
}

SortableColumnHeader.propTypes = {
  name: PropTypes.string.isRequired,
  sortingOptions: PropTypes.shape({
    sort_column: PropTypes.string.isRequired,
    sort_direction: PropTypes.oneOf(["asc", "desc"]).isRequired,
  }),
  onSortingOptionsChange: PropTypes.func,
  children: PropTypes.node,
};

function SortableColumnHeader({
  children,
  name,
  sortingOptions,
  onSortingOptionsChange,
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

BaseItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  pinned: PropTypes.bool,
  collection: PropTypes.object,
  sortingOptions: PropTypes.shape({
    sort_column: PropTypes.string.isRequired,
    sort_direction: PropTypes.oneOf(["asc", "desc"]).isRequired,
  }),
  onSortingOptionsChange: PropTypes.func,
  renderItem: PropTypes.func,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  onToggleSelected: PropTypes.func,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  getIsSelected: PropTypes.func,
  headless: PropTypes.bool,
};

function BaseItemsTable({
  items,
  pinned,
  collection,
  sortingOptions,
  onSortingOptionsChange,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
  selectedItems,
  getIsSelected = () => false,
  headless, // used when displaying dragged element
  ...props
}) {
  const itemRenderer = useCallback(
    (item, index) =>
      renderItem({
        item,
        index,
        collection,
        isPinned: pinned,
        isSelected: getIsSelected(item),
        onCopy,
        onMove,
        onDrop,
        onToggleSelected,
        selectedItems,
      }),
    [
      renderItem,
      collection,
      pinned,
      onCopy,
      onMove,
      onDrop,
      onToggleSelected,
      selectedItems,
      getIsSelected,
    ],
  );

  return (
    <table {...props} className="ContentTable">
      <colgroup>
        <col span="type" style={{ width: "5%" }} />
        <col span="name" style={{ width: "55%" }} />
        <col span="last-edited-by" style={{ width: "15%" }} />
        <col span="last-edited-at" style={{ width: "20%" }} />
        <col span="actions" style={{ width: "5%" }} />
      </colgroup>
      {!headless && (
        <thead
          data-testid={pinned ? "pinned-items-table-head" : "items-table-head"}
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
            <ColumnHeader>{t`Last edited by`}</ColumnHeader>
            <SortableColumnHeader
              name="last_edited"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Last edited at`}
            </SortableColumnHeader>
            <th></th>
          </tr>
        </thead>
      )}
      <tbody className="relative">{items.map(itemRenderer)}</tbody>
    </table>
  );
}

export default BaseItemsTable;
