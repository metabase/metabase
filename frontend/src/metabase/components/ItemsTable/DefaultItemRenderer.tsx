import { useCallback } from "react";

import type { ActionMenuProps } from "metabase/collections/components/ActionMenu";
import type { OnToggleSelectedWithItem } from "metabase/collections/types";
import type { BaseItemsTableProps } from "metabase/components/ItemsTable/BaseItemsTable";
import { Columns } from "metabase/components/ItemsTable/Columns";
import { color } from "metabase/lib/colors";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

export type ItemRendererProps = {
  item: CollectionItem;
  isSelected?: boolean;
  isPinned?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
  collection?: Collection;
  draggable?: boolean;
  testIdPrefix?: string;
  databases?: Database[];
  bookmarks?: Bookmark[];
} & ActionMenuProps &
  Pick<BaseItemsTableProps, "onClick" | "visibleColumnsMap">;

export const DefaultItemRenderer = ({
  item,
  isSelected,
  isPinned,
  onToggleSelected,
  collection,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
  databases,
  bookmarks,
  testIdPrefix = "item",
  onClick,
  visibleColumnsMap,
}: ItemRendererProps) => {
  const canSelect =
    collection?.can_write && typeof onToggleSelected === "function";

  const icon = item.getIcon();
  if (item.model === "card" || item.archived) {
    icon.color = color("text-light");
  }

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected?.(item);
  }, [item, onToggleSelected]);

  return (
    <>
      {canSelect && (
        <Columns.Select.Cell
          testIdPrefix={testIdPrefix}
          icon={icon}
          isPinned={isPinned}
          isSelected={isSelected}
          handleSelectionToggled={handleSelectionToggled}
        />
      )}
      {visibleColumnsMap["type"] && (
        <Columns.Type.Cell
          testIdPrefix={testIdPrefix}
          icon={icon}
          isPinned={isPinned}
        />
      )}
      {visibleColumnsMap["name"] && (
        <Columns.Name.Cell
          item={item}
          testIdPrefix={testIdPrefix}
          onClick={onClick}
        />
      )}
      {visibleColumnsMap["lastEditedBy"] && (
        <Columns.LastEditedBy.Cell item={item} testIdPrefix={testIdPrefix} />
      )}
      {visibleColumnsMap["lastEditedAt"] && (
        <Columns.LastEditedAt.Cell item={item} testIdPrefix={testIdPrefix} />
      )}
      {visibleColumnsMap["actionMenu"] && (
        <Columns.ActionMenu.Cell
          item={item}
          collection={collection}
          databases={databases}
          bookmarks={bookmarks}
          onCopy={onCopy}
          onMove={onMove}
          createBookmark={createBookmark}
          deleteBookmark={deleteBookmark}
        />
      )}
      <Columns.RightEdge.Cell />
    </>
  );
};
