import type { PropsWithChildren } from "react";
import { c, t } from "ttag";

import type { ActionMenuProps } from "metabase/collections/components/ActionMenu";
import ActionMenu from "metabase/collections/components/ActionMenu";
import { CheckBox } from "metabase/common/components/CheckBox";
import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { EntityItem } from "metabase/common/components/EntityItem";
import { Markdown } from "metabase/common/components/Markdown";
import { ArchiveButton } from "metabase/embedding/components/ArchiveButton";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useTranslateContent } from "metabase/i18n/hooks";
import { modelToUrl } from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type { IconProps } from "metabase/ui";
import { Tooltip } from "metabase/ui";
import type {
  CollectionItem,
  ListCollectionItemsSortColumn,
  SearchResult,
} from "metabase-types/api";

import type { SortableColumnHeaderProps } from "./BaseItemsTable";
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
  RowActionsContainer,
  TableColumn,
} from "./BaseItemsTable.styled";

type HeaderProps = Omit<
  SortableColumnHeaderProps<ListCollectionItemsSortColumn>,
  "name"
>;

const ItemLinkComponent = ({
  onClick,
  item,
  children,
}: PropsWithChildren<{
  item: CollectionItem;
  onClick?: (item: CollectionItem) => void;
}>) => {
  if (isEmbeddingSdk()) {
    return <ItemButton onClick={() => onClick?.(item)}>{children}</ItemButton>;
  }

  return (
    <ItemLink to={modelToUrl(item)} onClick={() => onClick?.(item)}>
      {children}
    </ItemLink>
  );
};

export const Columns = {
  Select: {
    Col: () => <col style={{ width: "70px" }} />,
    Header: ({
      selectedItems,
      hasUnselected,
      onSelectAll,
      onSelectNone,
    }: {
      selectedItems?: (CollectionItem | SearchResult)[];
      hasUnselected?: boolean;
      onSelectAll?: () => void;
      onSelectNone?: () => void;
    }) => (
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
    ),
    Cell: ({
      testIdPrefix,
      icon,
      isPinned,
      isSelected,
      handleSelectionToggled,
    }: {
      testIdPrefix: string;
      icon: IconProps;
      isPinned?: boolean;
      isSelected?: boolean;
      handleSelectionToggled: () => void;
    }) => (
      <ItemCell data-testid={`${testIdPrefix}-check`}>
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
    ),
  },
  Type: {
    Col: () => <col style={{ width: "70px" }} />,
    Header: ({
      sortingOptions,
      onSortingOptionsChange,
      title = t`Type`,
    }: HeaderProps) => (
      <SortableColumnHeader
        name="model"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
        style={{ marginInlineStart: 6 }}
      >
        {title}
      </SortableColumnHeader>
    ),
    Cell: ({
      testIdPrefix = "table",
      icon,
      isPinned,
    }: {
      testIdPrefix?: string;
      icon: IconProps;
      isPinned?: boolean;
    }) => (
      <ItemCell data-testid={`${testIdPrefix}-type`}>
        <EntityIconCheckBox variant="list" icon={icon} pinned={isPinned} />
      </ItemCell>
    ),
  },
  Name: {
    Col: ({ isInDragLayer }: { isInDragLayer: boolean }) => (
      <col style={{ width: isInDragLayer ? "10rem" : undefined }} />
    ),
    Header: ({ sortingOptions, onSortingOptionsChange }: HeaderProps) => (
      <SortableColumnHeader
        name="name"
        sortingOptions={sortingOptions}
        onSortingOptionsChange={onSortingOptionsChange}
      >
        {t`Name`}
      </SortableColumnHeader>
    ),
    Cell: ({
      item,
      testIdPrefix = "table",
      includeDescription = true,
      onClick,
    }: {
      item: CollectionItem;
      testIdPrefix?: string;
      includeDescription?: boolean;
      onClick?: (item: CollectionItem) => void;
    }) => {
      const tc = useTranslateContent();

      return (
        <ItemNameCell data-testid={`${testIdPrefix}-name`}>
          <ItemLinkComponent onClick={onClick} item={item}>
            <EntityItem.Name name={tc(item.name)} variant="list" />
            <PLUGIN_MODERATION.ModerationStatusIcon
              size={16}
              status={item.moderated_status}
            />
            {item.description && includeDescription && (
              <DescriptionIcon
                name="info"
                size={16}
                tooltip={
                  <Markdown dark disallowHeading unstyleLinks lineClamp={8}>
                    {tc(item.description)}
                  </Markdown>
                }
              />
            )}
          </ItemLinkComponent>
        </ItemNameCell>
      );
    },
  },
  Description: {
    Col: () => (
      <TableColumn
        hideAtContainerBreakpoint="sm"
        containerName="ItemsTableContainer"
      />
    ),
    Header: ({ sortingOptions, onSortingOptionsChange }: HeaderProps) => (
      <SortableColumnHeader
        name="description"
        sortingOptions={sortingOptions}
        hideAtContainerBreakpoint="sm"
        onSortingOptionsChange={onSortingOptionsChange}
      >
        {t`Description`}
      </SortableColumnHeader>
    ),
    Cell: ({
      item,
      testIdPrefix = "table",
    }: {
      item: CollectionItem;
      testIdPrefix?: string;
      onClick?: (item: CollectionItem) => void;
    }) => {
      const tc = useTranslateContent();

      return (
        <ItemCell data-testid={`${testIdPrefix}-description`}>
          <Ellipsified>{tc(item.description) ?? ""}</Ellipsified>
        </ItemCell>
      );
    },
  },
  LastEditedBy: {
    Col: () => (
      <TableColumn
        style={{ width: "140px" }}
        hideAtContainerBreakpoint="sm"
        containerName="ItemsTableContainer"
      />
    ),
    Header: ({
      sortingOptions,
      onSortingOptionsChange,
      isTrashed,
    }: HeaderProps & {
      isTrashed: boolean;
    }) => (
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
    Cell: ({
      testIdPrefix = "table",
      item,
    }: {
      testIdPrefix?: string;
      item: CollectionItem;
    }) => {
      const lastEditInfo = item["last-edit-info"];
      const lastEditedBy = getUserName(lastEditInfo) ?? "";

      return (
        <ItemCell
          data-testid={`${testIdPrefix}-last-edited-by`}
          hideAtContainerBreakpoint="sm"
          containerName="ItemsTableContainer"
        >
          <Ellipsified>{lastEditedBy}</Ellipsified>
        </ItemCell>
      );
    },
  },
  LastEditedAt: {
    Col: () => (
      <TableColumn
        style={{ width: "140px" }}
        hideAtContainerBreakpoint="md"
        containerName="ItemsTableContainer"
      />
    ),
    Header: ({
      sortingOptions,
      onSortingOptionsChange,
      isTrashed,
    }: HeaderProps & {
      isTrashed: boolean;
    }) => (
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
    Cell: ({
      testIdPrefix,
      item,
    }: {
      testIdPrefix: string;
      item: CollectionItem;
    }) => {
      const lastEditInfo = item["last-edit-info"];
      return (
        <ItemCell
          data-testid={`${testIdPrefix}-last-edited-at`}
          data-server-date
          hideAtContainerBreakpoint="md"
          containerName="ItemsTableContainer"
        >
          {lastEditInfo && (
            <Tooltip label={<DateTime value={lastEditInfo.timestamp} />}>
              <DateTime unit="day" value={lastEditInfo.timestamp} />
            </Tooltip>
          )}
        </ItemCell>
      );
    },
  },
  ActionMenu: {
    Header: () => <th></th>,
    Col: () => <col style={{ width: "100px" }} />,
    Cell: ({
      item,
      collection,
      databases,
      bookmarks,
      onCopy,
      onMove,
      createBookmark,
      deleteBookmark,
    }: ActionMenuProps) => {
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
          </RowActionsContainer>
        </ItemCell>
      );
    },
  },
  Archive: {
    Header: () => <th></th>,
    Col: () => <col style={{ width: "100px" }} />,
    Cell: ({ item }: { item: CollectionItem }) => {
      return (
        <ItemCell>
          <RowActionsContainer>
            <ArchiveButton item={item} />
          </RowActionsContainer>
        </ItemCell>
      );
    },
  },
  /** Applies a border-radius to the right edge of the table.
   * This is needed since columns can be hidden responsively,
   * and so we can't just apply the border-radius to the last column in the DOM */
  RightEdge: {
    Header: () => <th></th>,
    Col: () => <col style={{ width: "1rem" }} />,
    Cell: () => <ItemCell />,
  },
};
