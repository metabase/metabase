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

export const ROW_HEIGHT = 90;

const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
`;

export function BaseTableItem({
  item,
  collection,
  pinned,
  selectedItems,
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
  getIsSelected,
  linkProps = {},
  children,
}) {
  const isSelected = getIsSelected(item);
  const lastEditInfo = item["last-edit-info"];
  const lastEditedBy = `${lastEditInfo.first_name} ${lastEditInfo.last_name}`;
  const lastEditedAt = moment(lastEditInfo.timestamp).format("MMMM DD, YYYY");

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handlePin = useCallback(() => {
    item.setPinned(!pinned);
  }, [item, pinned]);

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
      <tr style={{ height: `${ROW_HEIGHT}px` }}>
        <td>
          <EntityItem.Icon
            item={item}
            variant="list"
            iconName={item.getIcon()}
            pinned={pinned}
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
  pinned,
  collection,
  onCopy,
  onMove,
  onDrop,
  selectedItems,
  getIsSelected,
  onToggleSelected,
}) {
  return (
    <BaseTableItem
      key={`${item.model}-${item.id}`}
      item={item}
      index={index}
      pinned={pinned}
      collection={collection}
      onCopy={onCopy}
      onMove={onMove}
      onDrop={onDrop}
      selectedItems={selectedItems}
      onToggleSelected={onToggleSelected}
      getIsSelected={getIsSelected}
      linkProps={getDefaultLinkProps(item)}
    />
  );
}

const defaultProps = {
  collection: {},
  renderItem: defaultItemRenderer,
  getLinkProps: item => ({
    className: "hover-parent hover--visibility",
    hover: { color: color("brand") },
    "data-metabase-event": `${ANALYTICS_CONTEXT};Item Click;${item.model}`,
  }),
};

function BaseItemsTable({
  items,
  pinned,
  collection,
  renderItem,
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
  selectedItems,
  getIsSelected,
}) {
  const itemRenderer = useCallback(
    (item, index) =>
      renderItem({
        item,
        index,
        collection,
        pinned,
        onCopy,
        onMove,
        onDrop,
        onToggleSelected,
        selectedItems,
        getIsSelected,
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
    <table className="ContentTable">
      <colgroup>
        <col span="1" style={{ width: "5%" }} />
        <col span="1" style={{ width: "55%" }} />
        <col span="1" style={{ width: "15%" }} />
        <col span="1" style={{ width: "20%" }} />
        <col span="1" style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <th className="text-centered">{t`Type`}</th>
          <th>{t`Name`}</th>
          <th>{t`Last edited by`}</th>
          <th>{t`Last edited at`}</th>
          <th></th>
        </tr>
      </thead>
      <tbody className="relative">{items.map(itemRenderer)}</tbody>
    </table>
  );
}

BaseItemsTable.defaultProps = defaultProps;

export default BaseItemsTable;
