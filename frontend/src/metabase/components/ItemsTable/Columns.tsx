import { useCallback, type PropsWithChildren } from "react";
import { c, t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ActionMenuProps } from "metabase/collections/components/ActionMenu";
import ActionMenu from "metabase/collections/components/ActionMenu";
import DateTime from "metabase/components/DateTime";
import EntityItem from "metabase/components/EntityItem";
import type { Edit } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import CheckBox from "metabase/core/components/CheckBox";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import { useSelector } from "metabase/lib/redux";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { CollectionItem } from "metabase-types/api";

import { SortableColumnHeader } from "./BaseItemsTable";
import {
  BulkSelectWrapper,
  ColumnHeader,
  DescriptionIcon,
  EntityIconCheckBox,
  ItemButton,
  ItemCell,
  ItemLink,
  ItemNameCell,
  ModelDetailLink,
  RowActionsContainer,
  TableColumn,
} from "./BaseItemsTable.styled";
import { createColumnHelper } from "@tanstack/react-table";

const ItemLinkComponent = ({
  onClick,
  item,
  children,
}: PropsWithChildren<{
  item: CollectionItem;
  onClick?: (item: CollectionItem) => void;
}>) => {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  if (isEmbeddingSdk) {
    return <ItemButton onClick={() => onClick?.(item)}>{children}</ItemButton>;
  }
  return (
    <ItemLink to={item.getUrl()} onClick={() => onClick?.(item)}>
      {children}
    </ItemLink>
  );
};

const columnHelper = createColumnHelper<CollectionItem>();

// TODO: make this not a function and hoist this up the table component so it doesn't have to be prop drilled
export const getColumns = ({
  sortingOptions,
  onSortingOptionsChange,
  isTrashed,
  collection,
  databases,
  bookmarks,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
  showActionMenu,
  selectedItems,
  hasUnselected,
  onSelectAll,
  onSelectNone,
  onToggleSelected,
  canSelect,
  isInDragLayer,
  getIsSelected,
}: {
  sortingOptions: any;
  onSortingOptionsChange: any;
  isTrashed: any;
  showActionMenu: any;
  selectedItems: any;
  hasUnselected: any;
  onSelectAll: any;
  onSelectNone: any;
  onToggleSelected: any;
  canSelect: any;
  isInDragLayer: any;
  getIsSelected: any;
} & Omit<ActionMenuProps, "item">) => [
  columnHelper.accessor(row => row, {
    id: "select",
    size: canSelect ? 70 : 0,
    header: () =>
      canSelect ? (
        <ColumnHeader>
          <BulkSelectWrapper>
            <CheckBox
              checked={!!selectedItems?.length}
              indeterminate={!!selectedItems?.length && !!hasUnselected}
              onChange={hasUnselected ? onSelectAll : onSelectNone}
              aria-label={t`Select all items`}
            />
          </BulkSelectWrapper>
        </ColumnHeader>
      ) : null,
    cell: ({ row }) => {
      const item = row.original;
      const icon = item.getIcon();
      if (item.model === "card" || item.archived) {
        icon.color = color("text-light");
      }

      const isPinned = false; // TODO: figure out how to determine if item is pinned
      const isSelected = getIsSelected(item);

      const handleSelectionToggled = useCallback(() => {
        onToggleSelected?.(item);
      }, [item, onToggleSelected]);

      if (!canSelect) {
        return null;
      }

      return (
        <ItemCell data-testid={`table-check`}>
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
      );
    },
  }),

  columnHelper.accessor(row => row.model, {
    id: "type",
    size: 70,
    header: () => (
      <SortableColumnHeader
        name="model"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
        style={{ marginInlineStart: 6 }}
      >
        {t`Type`}
      </SortableColumnHeader>
    ),
    cell: ({ row }) => {
      const item = row.original;
      const isPinned = false; // TODO: figure out how to determine if item is pinned
      const icon = item.getIcon();
      if (item.model === "card" || item.archived) {
        icon.color = color("text-light");
      }

      return (
        <ItemCell data-testid={`table-type`}>
          <EntityIconCheckBox variant="list" icon={icon} pinned={isPinned} />
        </ItemCell>
      );
    },
  }),
  columnHelper.accessor(row => row.name, {
    id: "name",
    size: isInDragLayer ? 160 : undefined,
    header: () => (
      <SortableColumnHeader
        name="name"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
      >
        {t`Name`}
      </SortableColumnHeader>
    ),
    cell: ({ cell, row: { original: item } }) => (
      <ItemNameCell data-testid={`tanstack-name`}>
        <ItemLinkComponent onClick={() => console.log("TODO")} item={item}>
          <EntityItem.Name name={cell.getValue()} variant="list" />
          <PLUGIN_MODERATION.ModerationStatusIcon
            size={16}
            status={item.moderated_status}
          />
          {item.description && (!!true || false) /*includeDescription*/ && (
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
        </ItemLinkComponent>
      </ItemNameCell>
    ),
  }),
  columnHelper.accessor(row => row["last-edit-info"], {
    id: "lastEditedBy",
    size: 140,
    header: () => (
      <SortableColumnHeader
        name="last_edited_by"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
        hideAtContainerBreakpoint="sm"
        containerName="ItemsTableContainer"
      >
        {isTrashed
          ? c("Precedes the name of a user").t`Deleted by`
          : t`Last edited by`}
      </SortableColumnHeader>
    ),
    cell: ({ cell }) => (
      <ItemCell
        data-testid={`table-last-edited-by`}
        hideAtContainerBreakpoint="sm"
        containerName="ItemsTableContainer"
      >
        <Ellipsified>{getLastEditedBy(cell.getValue())}</Ellipsified>
      </ItemCell>
    ),
  }),
  columnHelper.accessor(row => row["last-edit-info"], {
    id: "lastEditedAt",
    size: 140,
    header: () => (
      <SortableColumnHeader
        name="last_edited_at"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
        hideAtContainerBreakpoint="md"
        containerName="ItemsTableContainer"
      >
        {isTrashed
          ? c("Time which the item was deleted").t`Deleted at`
          : t`Last edited at`}
      </SortableColumnHeader>
    ),
    cell: ({ cell }) => {
      const lastEditInfo = cell.getValue();
      return (
        <ItemCell
          data-testid={`table-last-edited-at`}
          data-server-date
          hideAtContainerBreakpoint="md"
          containerName="ItemsTableContainer"
        >
          {lastEditInfo && (
            <Tooltip tooltip={<DateTime value={lastEditInfo.timestamp} />}>
              <DateTime unit="day" value={lastEditInfo.timestamp} />
            </Tooltip>
          )}
        </ItemCell>
      );
    },
  }),
  columnHelper.accessor(row => row, {
    id: "actionMenu",
    size: 100,
    header: () => (showActionMenu ? <th></th> : null),
    cell: ({ row: { original: item } }) => {
      if (!showActionMenu) return null;

      return (
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
      );
    },
  }),
  /** Applies a border-radius to the right edge of the table.
   * This is needed since columns can be hidden responsively,
   * and so we can't just apply the border-radius to the last column in the DOM */
  columnHelper.accessor(row => row, {
    id: "rightEdge",
    size: 16,
    header: () => <th></th>,
    cell: () => <ItemCell />,
  }),
];

const getLastEditedBy = (lastEditInfo?: Edit): string => {
  if (!lastEditInfo) {
    return "";
  }
  const name = getFullName(lastEditInfo);
  return name || lastEditInfo.email || "";
};
