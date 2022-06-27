import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import moment from "moment";

import { PLUGIN_MODERATION } from "metabase/plugins";

import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import Ellipsified from "metabase/core/components/Ellipsified";
import EntityItem from "metabase/components/EntityItem";
import DateTime from "metabase/components/DateTime";
import Tooltip from "metabase/components/Tooltip";
import ActionMenu from "metabase/collections/components/ActionMenu";

import { color } from "metabase/lib/colors";
import { getFullName } from "metabase/lib/user";

import {
  ItemCell,
  EntityIconCheckBox,
  ItemLink,
  TableItemSecondaryField,
  DescriptionIcon,
} from "./BaseItemsTable.styled";

BaseTableItem.propTypes = {
  bookmarks: PropTypes.arrayOf(PropTypes.object),
  createBookmark: PropTypes.func,
  deleteBookmark: PropTypes.func,
  item: PropTypes.object,
  draggable: PropTypes.bool,
  collection: PropTypes.object,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  isSelected: PropTypes.bool,
  isPinned: PropTypes.bool,
  linkProps: PropTypes.object,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  onToggleSelected: PropTypes.func,
};

export function BaseTableItem({
  bookmarks,
  createBookmark,
  deleteBookmark,
  item,
  draggable = true,
  collection = {},
  selectedItems,
  isSelected,
  isPinned,
  linkProps = {},
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
}) {
  const [isHoveringOverRow, setIsHoveringOverRow] = useState(false);

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const renderRow = useCallback(() => {
    const canSelect =
      collection.can_write && typeof onToggleSelected === "function";

    const lastEditInfo = item["last-edit-info"];

    // We don't keep last edit info for pulses
    // TODO Remove ternary when Pulses are gone (metabase#16519-1)
    const lastEditedBy = getLastEditedBy(lastEditInfo);
    const lastEditedAt = lastEditInfo
      ? moment(lastEditInfo.timestamp).format("MMMM DD, YYYY")
      : "";

    const testId = isPinned ? "pinned-collection-entry" : "collection-entry";

    const trStyles = {
      height: 48,
    };

    const icon = { name: item.getIcon().name };
    if (item.model === "card") {
      icon.color = color("text-light");
    }

    // Table row can be wrapped with ItemDragSource,
    // that only accepts native DOM elements as its children
    // So styled-components can't be used here
    return (
      <tr
        onMouseEnter={() => {
          setIsHoveringOverRow(true);
        }}
        onMouseLeave={() => {
          setIsHoveringOverRow(false);
        }}
        key={item.id}
        data-testid={testId}
        style={trStyles}
      >
        <ItemCell data-testid={`${testId}-type`}>
          <EntityIconCheckBox
            item={item}
            variant="list"
            icon={icon}
            pinned={isPinned}
            selectable={canSelect}
            selected={isSelected}
            disabled={!canSelect}
            onToggleSelected={handleSelectionToggled}
            showCheckbox={isHoveringOverRow}
          />
        </ItemCell>
        <ItemCell data-testid={`${testId}-name`}>
          <ItemLink {...linkProps} to={item.getUrl()}>
            <EntityItem.Name name={item.name} variant="list" />
            <PLUGIN_MODERATION.ModerationStatusIcon
              size={16}
              status={item.moderated_status}
            />
            {item.description && (
              <DescriptionIcon
                name="info"
                size={16}
                tooltip={item.description}
              />
            )}
          </ItemLink>
        </ItemCell>
        <ItemCell data-testid={`${testId}-last-edited-by`}>
          <Ellipsified>{lastEditedBy}</Ellipsified>
        </ItemCell>
        <ItemCell data-testid={`${testId}-last-edited-at`}>
          {lastEditInfo && (
            <Tooltip tooltip={<DateTime value={lastEditInfo.timestamp} />}>
              <TableItemSecondaryField>{lastEditedAt}</TableItemSecondaryField>
            </Tooltip>
          )}
        </ItemCell>
        <ItemCell>
          <ActionMenu
            createBookmark={createBookmark}
            deleteBookmark={deleteBookmark}
            bookmarks={bookmarks}
            item={item}
            collection={collection}
            onCopy={onCopy}
            onMove={onMove}
          />
        </ItemCell>
      </tr>
    );
  }, [
    bookmarks,
    createBookmark,
    deleteBookmark,
    onToggleSelected,
    item,
    isPinned,
    isSelected,
    handleSelectionToggled,
    isHoveringOverRow,
    linkProps,
    collection,
    onCopy,
    onMove,
  ]);

  if (!draggable) {
    return renderRow();
  }

  return (
    <ItemDragSource
      item={item}
      collection={collection}
      isSelected={isSelected}
      selected={selectedItems}
      onDrop={onDrop}
    >
      {renderRow()}
    </ItemDragSource>
  );
}

function getLastEditedBy(lastEditInfo) {
  if (!lastEditInfo) {
    return "";
  }

  const name = getFullName(lastEditInfo);
  return name || lastEditInfo.email;
}

export default BaseTableItem;
