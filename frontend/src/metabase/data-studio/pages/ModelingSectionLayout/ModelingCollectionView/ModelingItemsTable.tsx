import { type MouseEvent, useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  Cell,
  NameColumn,
  TableRow,
} from "metabase/browse/components/BrowseTable.styled";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import EntityItem from "metabase/common/components/EntityItem";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemNameCell,
  MaybeItemLink,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import Questions from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import { entityForObject } from "metabase/lib/schema";
import * as Urls from "metabase/lib/urls";
import {
  Button,
  Icon,
  type IconName,
  Menu,
  Repeat,
  Skeleton,
} from "metabase/ui";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import S from "./ModelingItemsTable.module.css";
import type { ModelingItem, SortColumn } from "./types";

interface ModelingItemsTableProps {
  items: ModelingItem[];
  skeleton?: boolean;
}

const DEFAULT_SORTING_OPTIONS: SortingOptions<SortColumn> = {
  sort_column: "name",
  sort_direction: SortDirection.Asc,
};

const itemsTableContainerName = "ItemsTableContainer";

const sharedProps = {
  containerName: itemsTableContainerName,
};

const descriptionProps = {
  ...sharedProps,
};

const menuProps = {
  ...sharedProps,
};

const DOTMENU_WIDTH = 34;

function getItemDescription(item: ModelingItem) {
  if (!item.description?.trim()) {
    return item.model === "metric" ? t`A metric` : t`A model`;
  }
  return item.description;
}

function sortItems(
  items: ModelingItem[],
  sortingOptions: SortingOptions<SortColumn>,
) {
  const { sort_column, sort_direction } = sortingOptions;

  return [...items].sort((a, b) => {
    const aValue = a[sort_column] ?? "";
    const bValue = b[sort_column] ?? "";
    const result = String(aValue).localeCompare(String(bValue));
    return sort_direction === SortDirection.Asc ? result : -result;
  });
}

export function ModelingItemsTable({
  items,
  skeleton = false,
}: ModelingItemsTableProps) {
  const [sortingOptions, setSortingOptions] = useState(DEFAULT_SORTING_OPTIONS);

  const sortedItems = sortItems(items, sortingOptions);

  const handleSortingOptionsChange = skeleton ? undefined : setSortingOptions;

  const descriptionWidth = 100;

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models and metrics`}>
      <colgroup>
        <NameColumn {...sharedProps} />
        <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />
        <TableColumn {...menuProps} width={DOTMENU_WIDTH} />
        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <SortableColumnHeader
            name="name"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
            {...sharedProps}
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Name`}
          </SortableColumnHeader>
          <SortableColumnHeader
            name="description"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
            {...descriptionProps}
            columnHeaderProps={{
              style: {
                paddingInline: ".5rem",
              },
            }}
          >
            <Ellipsified>{t`Description`}</Ellipsified>
          </SortableColumnHeader>
          <ColumnHeader
            style={{
              paddingInline: ".5rem",
            }}
          />
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {skeleton ? (
          <Repeat times={7}>
            <ItemRow />
          </Repeat>
        ) : (
          sortedItems.map((item: ModelingItem) => (
            <ItemRow item={item} key={`${item.model}-${item.id}`} />
          ))
        )}
      </TBody>
    </Table>
  );
}

function ItemRow({ item }: { item?: ModelingItem }) {
  const dispatch = useDispatch();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!item) {
        return;
      }

      const selection = document.getSelection();
      if (selection?.type === "Range") {
        event.stopPropagation();
        return;
      }

      const { id, model } = item;
      const url =
        model === "metric"
          ? Urls.dataStudioMetric(id)
          : Urls.dataStudioModel(id);
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

      event.preventDefault();
      event.stopPropagation();

      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        Urls.openInNewTab(subpathSafeUrl);
      } else {
        dispatch(push(url));
      }
    },
    [item, dispatch],
  );

  return (
    <TableRow onClick={handleClick}>
      <NameCell item={item} />
      <DescriptionCell item={item} />
      <MenuCell item={item} />
      <Columns.RightEdge.Cell />
    </TableRow>
  );
}

function SkeletonText() {
  return <Skeleton natural h="16.8px" />;
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

function preventDefault(event: MouseEvent) {
  event.preventDefault();
}

function NameCell({ item }: { item?: ModelingItem }) {
  const headingId = item ? `${item.model}-${item.id}-heading` : "dummy-heading";

  const icon = item
    ? (entityForObject(item)?.objectSelectors?.getIcon?.(item) as {
        name: IconName;
        color?: string;
      }) || { name: "folder" as IconName }
    : { name: "folder" as IconName };

  return (
    <ItemNameCell
      data-testid={`${item?.model || "item"}-name`}
      aria-labelledby={headingId}
      {...sharedProps}
    >
      <MaybeItemLink
        to={
          item
            ? item.model === "metric"
              ? Urls.metric({ id: item.id, name: item.name, type: "metric" })
              : Urls.dataStudioModel(item.id)
            : undefined
        }
        className={S.nameLink}
        onClick={preventDefault}
      >
        <Icon size={16} {...icon} c="icon-primary" className={S.icon} />
        {item ? (
          <EntityItem.Name
            name={item.name || ""}
            variant="list"
            id={headingId}
          />
        ) : (
          <SkeletonText />
        )}
      </MaybeItemLink>
    </ItemNameCell>
  );
}

function DescriptionCell({ item }: { item?: ModelingItem }) {
  return (
    <Cell {...descriptionProps}>
      {item ? (
        <MarkdownPreview
          lineClamp={12}
          allowedElements={["strong", "em"]}
          oneLine
        >
          {getItemDescription(item) || ""}
        </MarkdownPreview>
      ) : (
        <SkeletonText />
      )}
    </Cell>
  );
}

function MenuCell({ item }: { item?: ModelingItem }) {
  const dispatch = useDispatch();

  const handleDelete = useCallback(() => {
    if (!item) {
      return;
    }

    dispatch(
      Questions.actions.setArchived({ id: item.id, model: item.model }, true),
    );
  }, [item, dispatch]);

  if (!item?.can_write) {
    return <Cell />;
  }

  return (
    <Cell onClick={stopPropagation} className={S.menuCell}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            size="xs"
            variant="subtle"
            px="sm"
            aria-label={
              item.model === "metric" ? t`Delete metric` : t`Delete model`
            }
            c="text-dark"
          >
            <Icon name="ellipsis" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<Icon name="trash" />} onClick={handleDelete}>
            {t`Remove`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Cell>
  );
}
