import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import moment from "moment";

import { PLUGIN_MODERATION } from "metabase/plugins";

import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import EntityItem from "metabase/components/EntityItem";
import DateTime from "metabase/components/DateTime";
import Tooltip from "metabase/components/Tooltip";
import ActionMenu from "metabase/collections/components/ActionMenu";

import {
  EntityIconCheckBox,
  ItemLink,
  TableItemSecondaryField,
} from "./BaseItemsTable.styled";

BaseTableItem.propTypes = {
  item: PropTypes.object,
  draggable: PropTypes.bool,
  collection: PropTypes.object,
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  isSelected: PropTypes.bool,
  isPinned: PropTypes.bool,
  linkProps: PropTypes.object,
  hasBottomBorder: PropTypes.bool,
  onCopy: PropTypes.func,
  onMove: PropTypes.func,
  onDrop: PropTypes.func,
  onToggleSelected: PropTypes.func,
};

export function BaseTableItem({
  item,
  draggable = true,
  collection = {},
  selectedItems,
  isSelected,
  isPinned,
  linkProps = {},
  hasBottomBorder = true,
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
    const canSelect = typeof onToggleSelected === "function";

    const lastEditInfo = item["last-edit-info"];

    // We don't keep last edit info for pulses
    // TODO Remove ternary when Pulses are gone (metabase#16519-1)
    const lastEditedBy = lastEditInfo
      ? `${lastEditInfo.first_name} ${lastEditInfo.last_name}`
      : "";
    const lastEditedAt = lastEditInfo
      ? moment(lastEditInfo.timestamp).format("MMMM DD, YYYY")
      : "";

    const testId = isPinned ? "pinned-collection-entry" : "collection-entry";

    const trStyles = {
      height: 48,
    };

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
        <td data-testid={`${testId}-type`}>
          <EntityIconCheckBox
            item={item}
            variant="list"
            iconName={item.getIcon().name}
            pinned={isPinned}
            selectable={canSelect}
            selected={isSelected}
            onToggleSelected={handleSelectionToggled}
            showCheckbox={isHoveringOverRow}
          />
        </td>
        <td data-testid={`${testId}-name`}>
          <ItemLink {...linkProps} to={item.getUrl()}>
            <EntityItem.Name name={item.name} />
            <PLUGIN_MODERATION.ModerationStatusIcon
              status={item.moderated_status}
            />
          </ItemLink>
        </td>
        <td data-testid={`${testId}-last-edited-by`}>
          <TableItemSecondaryField>{lastEditedBy}</TableItemSecondaryField>
        </td>
        <td data-testid={`${testId}-last-edited-at`}>
          {lastEditInfo && (
            <Tooltip tooltip={<DateTime value={lastEditInfo.timestamp} />}>
              <TableItemSecondaryField>{lastEditedAt}</TableItemSecondaryField>
            </Tooltip>
          )}
        </td>
        <td>
          <ActionMenu
            item={item}
            collection={collection}
            onCopy={onCopy}
            onMove={onMove}
          />
        </td>
      </tr>
    );
  }, [
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

export default BaseTableItem;
