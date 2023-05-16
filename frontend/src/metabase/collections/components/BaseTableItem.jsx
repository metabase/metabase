import React, { useCallback } from "react";
import PropTypes from "prop-types";
import moment from "moment-timezone";

import { PLUGIN_MODERATION } from "metabase/plugins";

import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import Ellipsified from "metabase/core/components/Ellipsified";
import EntityItem from "metabase/components/EntityItem";
import DateTime from "metabase/components/DateTime";
import Tooltip from "metabase/core/components/Tooltip";
import Markdown from "metabase/core/components/Markdown";
import ActionMenu from "metabase/collections/components/ActionMenu";

import { color } from "metabase/lib/colors";
import { getFullName } from "metabase/lib/user";

import {
  ItemCell,
  ItemNameCell,
  EntityIconCheckBox,
  ItemLink,
  TableItemSecondaryField,
  DescriptionIcon,
  ModelDetailLink,
  RowActionsContainer,
} from "./BaseItemsTable.styled";

BaseTableItem.propTypes = {
  databases: PropTypes.arrayOf(PropTypes.object),
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
  databases,
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
      <tr key={item.id} data-testid={testId} style={trStyles}>
        {canSelect && (
          <ItemCell data-testid={`${testId}-check`}>
            <EntityIconCheckBox
              item={item}
              variant="list"
              icon={icon}
              pinned={isPinned}
              selected={isSelected}
              onToggleSelected={handleSelectionToggled}
              selectable
              showCheckbox
            />
          </ItemCell>
        )}
        <ItemCell data-testid={`${testId}-type`}>
          <EntityIconCheckBox
            item={item}
            variant="list"
            icon={icon}
            pinned={isPinned}
          />
        </ItemCell>
        <ItemNameCell data-testid={`${testId}-name`}>
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
                tooltip={
                  <Markdown disallowHeading unstyleLinks>
                    {item.description}
                  </Markdown>
                }
              />
            )}
          </ItemLink>
        </ItemNameCell>
        <ItemCell data-testid={`${testId}-last-edited-by`}>
          <Ellipsified>{lastEditedBy}</Ellipsified>
        </ItemCell>
        <ItemCell data-testid={`${testId}-last-edited-at`} data-server-date>
          {lastEditInfo && (
            <Tooltip tooltip={<DateTime value={lastEditInfo.timestamp} />}>
              <TableItemSecondaryField>{lastEditedAt}</TableItemSecondaryField>
            </Tooltip>
          )}
        </ItemCell>
        <ItemCell>
          <RowActionsContainer>
            <ActionMenu
              item={item}
              collection={collection}
              databases={databases}
              bookmarks={bookmarks}
              onCopy={onCopy}
              onMove={onMove}
              createBookmark={createBookmark}
              deleteBookmark={deleteBookmark}
            />
            {item.model === "dataset" && <ModelDetailLink model={item} />}
          </RowActionsContainer>
        </ItemCell>
      </tr>
    );
  }, [
    databases,
    bookmarks,
    createBookmark,
    deleteBookmark,
    onToggleSelected,
    item,
    isPinned,
    isSelected,
    handleSelectionToggled,
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
