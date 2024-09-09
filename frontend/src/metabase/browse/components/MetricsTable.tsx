import { type MouseEvent, useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import EntityItem from "metabase/components/EntityItem";
import { SortableColumnHeader } from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ItemNameCell,
  MaybeItemLink,
  TBody,
  Table,
  TableColumn,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { MarkdownPreview } from "metabase/core/components/MarkdownPreview";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { FixedSizeIcon, Flex, Skeleton } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { MetricResult } from "../types";

import {
  Cell,
  CollectionLink,
  CollectionTableCell,
  NameColumn,
  TableRow,
} from "./BrowseTable.styled";
import { getMetricDescription, sortModelOrMetric } from "./utils";

type MetricsTableProps = {
  metrics?: MetricResult[];
  skeleton?: boolean;
};

const DEFAULT_SORTING_OPTIONS: SortingOptions = {
  sort_column: "name",
  sort_direction: SortDirection.Asc,
};

export const itemsTableContainerName = "ItemsTableContainer";

const nameProps = {
  containerName: itemsTableContainerName,
};

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: itemsTableContainerName,
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: itemsTableContainerName,
};

export function MetricsTable({
  skeleton = false,
  metrics = [],
}: MetricsTableProps) {
  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const locale = useLocale();
  const sortedMetrics = sortModelOrMetric(metrics, sortingOptions, locale);

  const handleSortingOptionsChange = skeleton ? undefined : setSortingOptions;

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  return (
    <Table aria-label={skeleton ? undefined : t`Table of metrics`}>
      <colgroup>
        {/* <col> for Name column */}
        <NameColumn {...nameProps} />

        {/* <col> for Collection column */}
        <TableColumn {...collectionProps} width={`${collectionWidth}%`} />

        {/* <col> for Description column */}
        <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />

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
      const url = Urls.metric({ id, name });
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
          metric ? Urls.metric({ id: metric.id, name: metric.name }) : undefined
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
