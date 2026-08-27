import type { PropsWithChildren } from "react";
import { c, t } from "ttag";

import type { ActionMenuProps } from "metabase/common/collections/components/ActionMenu";
import { ActionMenu } from "metabase/common/collections/components/ActionMenu";
import { DateTime } from "metabase/common/components/DateTime";
import { EntityItemName } from "metabase/common/components/EntityItemName";
import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { ArchiveButton } from "metabase/embedding/components/ArchiveButton";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Checkbox, Ellipsified, type IconProps, Tooltip } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import { isTouchDevice } from "metabase/utils/browser";
import { isPlainKey } from "metabase/utils/keyboard";
import { getUserName } from "metabase/utils/user";
import type {
  CollectionItem,
  ListCollectionItemsSortColumn,
  SearchResult,
} from "metabase-types/api";

import type { SortableColumnHeaderProps } from "./BaseItemsTable/BaseItemsTable";
import { SortableColumnHeader } from "./BaseItemsTable/BaseItemsTable";
import {
  BulkSelectWrapper,
  ColumnHeader,
  DescriptionIcon,
  ItemButton,
  ItemCell,
  ItemLink,
  ItemNameCell,
  RowActionsContainer,
  TableColumn,
} from "./BaseItemsTable.styled";
import { EntityIconCheckBox } from "./EntityIconCheckBox";

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
    <ItemLink
      draggable={item.model !== "collection"}
      to={modelToUrl(item)}
      onClick={() => onClick?.(item)}
    >
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
          <Checkbox
            checked={!!selectedItems?.length}
            indeterminate={!!selectedItems?.length && !!hasUnselected}
            onChange={hasUnselected ? onSelectAll : onSelectNone}
            onKeyDown={(event) => {
              if (
                // Blurs the checkbox when these keys are pressed so that shortcuts can work
                isPlainKey(event, "Escape") ||
                isPlainKey(event, "Delete") ||
                isPlainKey(event, "Backspace")
              ) {
                event.currentTarget.blur();
              }
            }}
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
    Col: () => <col />,
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
            <EntityItemName name={tc(item.name)} />
            <PLUGIN_MODERATION.ModerationStatusIcon
              size={16}
              status={item.moderated_status}
            />
            {item.description && includeDescription && (
              <DescriptionIcon
                name="info"
                size={16}
                tooltip={
                  <Markdown
                    dark
                    compact
                    disallowHeading
                    unstyleLinks
                    lineClamp={8}
                  >
                    {tc(item.description)}
                  </Markdown>
                }
                onClick={(event) => {
                  // On mobile devices we allow clicking on the icon to show the description
                  if (isTouchDevice()) {
                    event.stopPropagation();
                    event.preventDefault();
                  }
                }}
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
    Cell: (props: ActionMenuProps) => {
      return (
        <ItemCell>
          <RowActionsContainer data-ignore-row-selection>
            <ActionMenu {...props} />
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
