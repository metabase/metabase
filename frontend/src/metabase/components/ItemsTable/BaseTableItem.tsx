import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { useCallback } from "react";

import ActionMenu from "metabase/collections/components/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnDrop,
  OnMove,
  OnToggleSelectedWithItem,
} from "metabase/collections/types";
import DateTime from "metabase/components/DateTime";
import EntityItem from "metabase/components/EntityItem";
import type { Edit } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import {
  DescriptionIcon,
  EntityIconCheckBox,
  ItemCell,
  ItemLink,
  ItemNameCell,
  ModelDetailLink,
  RowActionsContainer,
  TableItemSecondaryField,
} from "./BaseItemsTable.styled";

export type BaseTableItemProps = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  item: CollectionItem;
  draggable?: boolean;
  collection?: Collection;
  selectedItems?: CollectionItem[];
  isSelected?: boolean;
  isPinned?: boolean;
  linkProps?: any;
  onCopy?: OnCopy;
  onMove?: OnMove;
  onDrop?: OnDrop;
  onToggleSelected?: OnToggleSelectedWithItem;
};

export const BaseTableItem = ({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  item,
  draggable = true,
  collection,
  selectedItems,
  isSelected,
  isPinned,
  linkProps = {},
  onCopy,
  onMove,
  onDrop,
  onToggleSelected,
}: BaseTableItemProps) => {
  const handleSelectionToggled = useCallback(() => {
    onToggleSelected?.(item);
  }, [item, onToggleSelected]);

  const renderRow = useCallback(() => {
    const canSelect =
      collection?.can_write && typeof onToggleSelected === "function";

    const lastEditInfo = item["last-edit-info"];
    const lastEditedBy = getLastEditedBy(lastEditInfo);
    const lastEditedAt = lastEditInfo
      ? moment(lastEditInfo.timestamp).format("MMMM DD, YYYY")
      : "";

    const testId = isPinned ? "pinned-collection-entry" : "collection-entry";

    const trStyles = {
      height: 48,
    };

    const icon = item.getIcon();
    if (item.archived || item.model === "card") {
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
          <EntityIconCheckBox variant="list" icon={icon} pinned={isPinned} />
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
                  <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
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
            {item.model === "dataset" && !item.archived && (
              <ModelDetailLink model={item} />
            )}
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
};

const getLastEditedBy = (lastEditInfo?: Edit) => {
  if (!lastEditInfo) {
    return "";
  }
  const name = getFullName(lastEditInfo);
  return name || lastEditInfo.email;
};

// eslint-disable-next-line import/no-default-export
export default BaseTableItem;
