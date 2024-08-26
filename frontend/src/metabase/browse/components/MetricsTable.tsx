import { type CSSProperties, type PropsWithChildren, useState } from "react";
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
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Box,
  FixedSizeIcon,
  Flex,
  Icon,
  type IconName,
  type IconProps,
  Skeleton,
} from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { MetricResult } from "../types";
import { getIcon } from "../utils";

import { EllipsifiedWithMarkdownTooltip } from "./EllipsifiedWithMarkdownTooltip";
import { getMetricDescription, sortMetrics } from "./utils";

type MetricsTableProps = {
  metrics?: MetricResult[];
  skeleton?: boolean;
};

const DEFAULT_SORTING_OPTIONS: SortingOptions = {
  sort_column: "name",
  sort_direction: SortDirection.Asc,
};

export const itemsTableContainerName = "ItemsTableContainer";

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
  const sortedMetrics = sortMetrics(metrics, sortingOptions, locale);

  const handleSortingOptionsChange = skeleton ? undefined : setSortingOptions;

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models`}>
      <thead>
        <tr>
          <SortableColumnHeader
            name="name"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
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
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Collection`}
          </SortableColumnHeader>
          <SortableColumnHeader
            name="description"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Description`}
          </SortableColumnHeader>
        </tr>
      </thead>
      <TBody>
        {skeleton ? (
          <Repeat times={7}>
            <TBodyRowSkeleton />
          </Repeat>
        ) : (
          sortedMetrics.map((metric: MetricResult) => (
            <TBodyRow metric={metric} key={`${metric.model}-${metric.id}`} />
          ))
        )}
      </TBody>
    </Table>
  );
}

function TBodyRow({
  metric,
  skeleton,
}: {
  metric: MetricResult;
  skeleton?: boolean;
}) {
  const icon = getIcon(metric);
  const dispatch = useDispatch();
  const { id, name } = metric;

  return (
    <tr
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        const url = Urls.metric({ id, name });
        const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

        if ((e.ctrlKey || e.metaKey) && e.button === 0) {
          Urls.openInNewTab(subpathSafeUrl);
        } else {
          dispatch(push(url));
        }
      }}
      tabIndex={0}
      key={metric.id}
    >
      {/* Name */}
      <NameCell
        metric={metric}
        icon={icon}
        onClick={() => {
          if (skeleton) {
            return;
          }
          // TODO
          // trackModelClick(model.id);
        }}
      />

      {/* Collection */}
      <td
        data-testid={`path-for-collection: ${
          metric.collection
            ? getCollectionName(metric.collection)
            : t`Untitled collection`
        }`}
        {...collectionProps}
      >
        <Link
          // className={S.collectionLink}
          to={Urls.collection(metric.collection)}
          onClick={e => e.stopPropagation()}
        >
          <Flex gap="sm">
            <FixedSizeIcon name="folder" />
            <Box w="calc(100% - 1.5rem)">
              <EllipsifiedCollectionPath collection={metric.collection} />
            </Box>
          </Flex>
        </Link>
      </td>

      {/* Description */}
      <td {...descriptionProps}>
        <EllipsifiedWithMarkdownTooltip>
          {getMetricDescription(metric) || ""}
        </EllipsifiedWithMarkdownTooltip>
      </td>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </tr>
  );
}

const TBodyRowSkeleton = ({ style }: { style?: CSSProperties }) => {
  const icon = { name: "metric" as IconName };

  return (
    <tr style={style}>
      {/* Name */}
      <NameCell icon={icon}>
        <CellTextSkeleton />
      </NameCell>

      {/* Collection */}
      <td {...collectionProps}>
        <Flex gap=".5rem">
          <FixedSizeIcon name="folder" />
          <CellTextSkeleton />
        </Flex>
      </td>

      {/* Description */}
      <td {...descriptionProps}>
        <CellTextSkeleton />
      </td>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </tr>
  );
};

const CellTextSkeleton = () => {
  return <Skeleton natural h="16.8px" />;
};

function NameCell({
  metric,
  testIdPrefix = "table",
  onClick,
  icon,
  children,
}: PropsWithChildren<{
  metric?: MetricResult;
  testIdPrefix?: string;
  onClick?: () => void;
  icon: IconProps;
}>) {
  const headingId = `model-${metric?.id || "dummy"}-heading`;
  return (
    <ItemNameCell
      data-testid={`${testIdPrefix}-name`}
      aria-labelledby={headingId}
    >
      <MaybeItemLink
        to={
          metric ? Urls.metric({ id: metric.id, name: metric.name }) : undefined
        }
        onClick={onClick}
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
      >
        <Icon
          size={16}
          {...icon}
          color={"var(--mb-color-brand)"}
          style={{ flexShrink: 0 }}
        />
        {children || (
          <EntityItem.Name
            name={metric?.name || ""}
            variant="list"
            id={headingId}
          />
        )}
      </MaybeItemLink>
    </ItemNameCell>
  );
}
