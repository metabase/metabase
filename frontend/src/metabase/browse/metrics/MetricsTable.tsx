import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
} from "metabase/api";
import { getCollectionName } from "metabase/collections/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { EntityItem } from "metabase/common/components/EntityItem";
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
import type { ResponsiveProps } from "metabase/common/components/ItemsTable/utils";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { Bookmarks } from "metabase/entities/bookmarks";
import { Questions } from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Button,
  FixedSizeIcon,
  Flex,
  Icon,
  type IconName,
  Menu,
  Repeat,
  Skeleton,
} from "metabase/ui";
import type { SortingOptions } from "metabase-types/api";

import {
  Cell,
  CollectionLink,
  CollectionTableCell,
  NameColumn,
  TableRow,
} from "../components/BrowseTable.styled";

import { trackMetricBookmarked } from "./analytics";
import type { MetricResult, SortColumn } from "./types";
import { getMetricDescription, sortMetrics } from "./utils";

type MetricsTableProps = {
  metrics?: MetricResult[];
  skeleton?: boolean;
};

const DEFAULT_SORTING_OPTIONS: SortingOptions<SortColumn> = {
  sort_column: "name",
  sort_direction: "asc",
};

export const itemsTableContainerName = "ItemsTableContainer";

const sharedProps = {
  containerName: itemsTableContainerName,
};

const nameProps = {
  ...sharedProps,
};

const descriptionProps: ResponsiveProps = {
  ...sharedProps,
  hideAtContainerBreakpoint: "md",
};

const collectionProps: ResponsiveProps = {
  ...sharedProps,
  hideAtContainerBreakpoint: "sm",
};

const menuProps = {
  ...sharedProps,
};

const DOTMENU_WIDTH = 34;

export function MetricsTable({
  skeleton = false,
  metrics = [],
}: MetricsTableProps) {
  const [sortingOptions, setSortingOptions] = useState(DEFAULT_SORTING_OPTIONS);

  const sortedMetrics = sortMetrics(metrics, sortingOptions);

  const handleSortingOptionsChange = skeleton ? undefined : setSortingOptions;

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 30;
  const descriptionWidth = 100 - collectionWidth;

  return (
    <Table aria-label={skeleton ? undefined : t`Table of metrics`}>
      <colgroup>
        {/* <col> for Name column */}
        <NameColumn {...nameProps} />
        <TableColumn {...collectionProps} width={`${collectionWidth}%`} />
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
            {...nameProps}
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Name`}
          </SortableColumnHeader>
          <SortableColumnHeader
            name="collection"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
            {...collectionProps}
            columnHeaderProps={{
              style: {
                paddingInline: ".5rem",
              },
            }}
          >
            {t`Collection`}
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
            {t`Description`}
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
            <MetricRow />
          </Repeat>
        ) : (
          sortedMetrics.map((metric: MetricResult) => (
            <MetricRow metric={metric} key={metric.id} />
          ))
        )}
      </TBody>
    </Table>
  );
}

function MetricRow({ metric }: { metric?: MetricResult }) {
  const dispatch = useDispatch();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!metric) {
        return;
      }

      // do not trigger click when selecting text
      const selection = document.getSelection();
      if (selection?.type === "Range") {
        event.stopPropagation();
        return;
      }

      const { id, name } = metric;
      const url = Urls.metric({ id, name, type: "metric" });
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

      // TODO: metabase/metabse#47713
      // trackMetricClick(metric.id);

      event.preventDefault();
      event.stopPropagation();

      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        Urls.openInNewTab(subpathSafeUrl);
      } else {
        dispatch(push(url));
      }
    },
    [metric, dispatch],
  );

  return (
    <TableRow onClick={handleClick}>
      <NameCell metric={metric} />
      <CollectionCell metric={metric} />
      <DescriptionCell metric={metric} />
      <MenuCell metric={metric} />
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

function NameCell({ metric }: { metric?: MetricResult }) {
  const headingId = `metric-${metric?.id ?? "dummy"}-heading`;

  return (
    <ItemNameCell
      data-testid="metric-name"
      aria-labelledby={headingId}
      {...nameProps}
    >
      <MaybeItemLink
        to={
          metric
            ? Urls.metric({ id: metric.id, name: metric.name, type: "metric" })
            : undefined
        }
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
        onClick={preventDefault}
      >
        {metric ? (
          <EntityItem.Name
            name={metric?.name || ""}
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

function CollectionCell({ metric }: { metric?: MetricResult }) {
  const collectionName = metric?.collection
    ? getCollectionName(metric.collection)
    : t`Untitled collection`;

  const content = (
    <Flex gap="sm">
      <FixedSizeIcon name="folder" />

      {metric ? (
        <EllipsifiedCollectionPath collection={metric.collection} />
      ) : (
        <SkeletonText />
      )}
    </Flex>
  );

  return (
    <CollectionTableCell
      data-testid={`path-for-collection: ${collectionName}`}
      {...collectionProps}
    >
      {metric?.collection ? (
        <CollectionLink
          to={Urls.collection(metric.collection)}
          onClick={stopPropagation}
        >
          {content}
        </CollectionLink>
      ) : (
        content
      )}
    </CollectionTableCell>
  );
}

function DescriptionCell({ metric }: { metric?: MetricResult }) {
  return (
    <Cell {...descriptionProps}>
      {metric ? (
        <MarkdownPreview
          lineClamp={12}
          allowedElements={["strong", "em"]}
          oneLine
        >
          {getMetricDescription(metric) || ""}
        </MarkdownPreview>
      ) : (
        <SkeletonText />
      )}
    </Cell>
  );
}

type MetricAction = {
  key: string;
  title: string;
  icon: IconName;
  action: () => void;
};

function MenuCell({ metric }: { metric?: MetricResult }) {
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();
  const dispatch = useDispatch();

  const actions = useMemo(() => {
    if (!metric) {
      return [];
    }

    const actions: MetricAction[] = [];

    if (metric.bookmark) {
      actions.push({
        key: "remove-bookmark",
        title: t`Remove from bookmarks`,
        icon: "bookmark",
        async action() {
          await deleteBookmark({
            id: metric.id,
            type: "card",
          });

          dispatch(Bookmarks.actions.invalidateLists());
        },
      });
    } else {
      actions.push({
        key: "add-bookmark",
        title: c("Verb").t`Bookmark`,
        icon: "bookmark",
        async action() {
          await createBookmark({
            id: metric.id,
            type: "card",
          });

          trackMetricBookmarked();
          dispatch(Bookmarks.actions.invalidateLists());
        },
      });
    }

    if (metric.collection) {
      actions.push({
        key: "open-collection",
        title: t`Open collection`,
        icon: "folder",
        action() {
          dispatch(push(Urls.collection(metric.collection)));
        },
      });
    }

    if (metric.can_write) {
      actions.push({
        key: "move-to-trash",
        title: t`Move to trash`,
        icon: "trash",
        action() {
          dispatch(
            Questions.actions.setArchived(
              { id: metric.id, model: "metric" },
              true,
            ),
          );
        },
      });
    }

    return actions;
  }, [metric, createBookmark, deleteBookmark, dispatch]);

  return (
    <Cell onClick={stopPropagation} style={{ padding: 0 }}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            size="xs"
            variant="subtle"
            px="sm"
            aria-label={t`Metric options`}
            c="text-primary"
          >
            <Icon name="ellipsis" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {actions.map((action) => (
            <Menu.Item
              key={action.key}
              leftSection={<Icon name={action.icon} />}
              onClick={action.action}
            >
              {action.title}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Cell>
  );
}
