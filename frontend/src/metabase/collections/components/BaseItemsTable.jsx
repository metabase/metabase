/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import moment from "moment";
import styled from "styled-components";

import { color } from "metabase/lib/colors";

import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

export const ROW_HEIGHT = 80;

const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
`;

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
  const lastEditedBy = `${lastEditInfo.first_name} ${lastEditInfo.last_name}`;
  const lastEditedAt = moment(lastEditInfo.timestamp).format("MMMM DD, YYYY");

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handlePin = useCallback(() => {
    item.setPinned(!isPinned);
  }, [item, isPinned]);

  const handleMove = useCallback(() => onMove([item]), [item, onMove]);
  const handleCopy = useCallback(() => onCopy([item]), [item, onCopy]);
  const handleArchive = useCallback(() => item.setArchived(true), [item]);

  return (
    <ItemDragSource
      item={item}
      collection={collection}
      isSelected={isSelected}
      selected={selectedItems}
      onDrop={onDrop}
    >
      <tr
        data-testid={isPinned ? "pinned-collection-entry" : "collection-entry"}
        style={{
          height: `${ROW_HEIGHT}px`,
          "border-bottom": hasBottomBorder
            ? `1px solid ${color("bg-medium")}`
            : "none",
        }}
      >
        <td>
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
        <td>
          <Link {...linkProps} to={item.getUrl()}>
            <EntityItem.Name name={item.name} />
          </Link>
        </td>
        <td>
          <TableItemSecondaryField className="text-dark">
            {lastEditedBy}
          </TableItemSecondaryField>
        </td>
        <td>
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

function BaseItemsTable({
  items,
  pinned,
  collection,
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
        <thead>
          <tr>
            <th className="text-centered">{t`Type`}</th>
            <th>{t`Name`}</th>
            <th>{t`Last edited by`}</th>
            <th>{t`Last edited at`}</th>
            <th></th>
          </tr>
        </thead>
      )}
      <tbody className="relative">{items.map(itemRenderer)}</tbody>
    </table>
  );
}

export default BaseItemsTable;
