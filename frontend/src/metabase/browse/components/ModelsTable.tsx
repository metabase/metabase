import {
  type PropsWithChildren,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import EntityItem from "metabase/components/EntityItem";
import { SortableColumnHeader } from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ItemNameCell,
  MaybeItemLink,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Flex,
  Icon,
  type IconProps,
  type IconName,
  Skeleton,
} from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import { trackModelClick } from "../analytics";
import type { ModelResult } from "../types";
import { getIcon } from "../utils";

import {
  CollectionBreadcrumbsWithTooltip,
  SimpleCollectionDisplay,
} from "./CollectionBreadcrumbsWithTooltip";
import { CollectionsIcon } from "./CollectionBreadcrumbsWithTooltip.styled";
import { EllipsifiedWithMarkdownTooltip } from "./EllipsifiedWithMarkdownTooltip";
import {
  ModelCell,
  ModelNameColumn,
  ModelTableRow,
} from "./ModelsTable.styled";
import { getModelDescription, sortModels } from "./utils";

export interface ModelsTableProps {
  models?: ModelResult[];
  /** True if this component is just rendering a loading skeleton */
  skeleton?: boolean;
}

export const itemsTableContainerName = "ItemsTableContainer";

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: itemsTableContainerName,
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: itemsTableContainerName,
};

const DEFAULT_SORTING_OPTIONS: SortingOptions = {
  sort_column: "collection",
  sort_direction: SortDirection.Asc,
};

const LARGE_DATASET_THRESHOLD = 500;

export const ModelsTable = ({
  models = [],
  skeleton = false,
}: ModelsTableProps) => {
  // for large datasets, we need to simplify the display to avoid performance issues
  const isLargeDataset = models.length > LARGE_DATASET_THRESHOLD;

  const [showLoadingManyRows, setShowLoadingManyRows] =
    useState(isLargeDataset);

  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const locale = useLocale();
  const sortedModels = sortModels(models, sortingOptions, locale);

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  const handleUpdateSortOptions = skeleton
    ? undefined
    : (newSortingOptions: SortingOptions) => {
        if (isLargeDataset) {
          setShowLoadingManyRows(true);
        }
        setSortingOptions(newSortingOptions);
      };

  useEffect(() => {
    // we need a better virtualized table solution for large datasets
    // for now, we show loading text to make this component feel more responsive
    if (isLargeDataset && showLoadingManyRows) {
      setTimeout(() => setShowLoadingManyRows(false), 10);
    }
  }, [isLargeDataset, showLoadingManyRows, sortedModels]);

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models`}>
      <colgroup>
        {/* <col> for Name column */}
        <ModelNameColumn containerName={itemsTableContainerName} />

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
            onSortingOptionsChange={handleUpdateSortOptions}
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
            onSortingOptionsChange={handleUpdateSortOptions}
            {...collectionProps}
            columnHeaderProps={{
              style: {
                paddingInline: ".5rem",
              },
            }}
          >
            <Ellipsified>{t`Collection`}</Ellipsified>
          </SortableColumnHeader>
          <SortableColumnHeader
            name="description"
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
        {showLoadingManyRows ? (
          <TableLoader />
        ) : skeleton ? (
          <Repeat times={7}>
            <TBodyRowSkeleton />
          </Repeat>
        ) : (
          sortedModels.map((model: ModelResult) => (
            <TBodyRow
              model={model}
              key={`${model.model}-${model.id}`}
              simpleDisplay={isLargeDataset}
            />
          ))
        )}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({
  model,
  simpleDisplay,
  skeleton,
}: {
  model: ModelResult;
  simpleDisplay: boolean;
  skeleton?: boolean;
}) => {
  const icon = getIcon(model);
  const containerName = `collections-path-for-${model.id}`;
  const dispatch = useDispatch();
  const { id, name } = model;

  return (
    <ModelTableRow
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        const url = Urls.model({ id, name });
        if ((e.ctrlKey || e.metaKey) && e.button === 0) {
          window.open(url, "_blank");
        } else {
          dispatch(push(url));
        }
      }}
      tabIndex={0}
      key={model.id}
    >
      {/* Name */}
      <NameCell
        model={model}
        icon={icon}
        onClick={() => {
          if (skeleton) {
            return;
          }
          trackModelClick(model.id);
        }}
      />

      {/* Collection */}
      <ModelCell
        data-testid={`path-for-collection: ${
          model.collection
            ? getCollectionName(model.collection)
            : t`Untitled collection`
        }`}
        {...collectionProps}
      >
        {simpleDisplay ? (
          <SimpleCollectionDisplay collection={model.collection} />
        ) : (
          <CollectionBreadcrumbsWithTooltip
            containerName={containerName}
            collection={model.collection}
          />
        )}
      </ModelCell>

      {/* Description */}
      <ModelCell {...descriptionProps}>
        <EllipsifiedWithMarkdownTooltip>
          {getModelDescription(model) || ""}
        </EllipsifiedWithMarkdownTooltip>
      </ModelCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </ModelTableRow>
  );
};

const NameCell = ({
  model,
  testIdPrefix = "table",
  onClick,
  icon,
  children,
}: PropsWithChildren<{
  model?: ModelResult;
  testIdPrefix?: string;
  onClick?: () => void;
  icon: IconProps;
}>) => {
  const headingId = `model-${model?.id || "dummy"}-heading`;
  return (
    <ItemNameCell
      data-testid={`${testIdPrefix}-name`}
      aria-labelledby={headingId}
    >
      <MaybeItemLink
        to={model ? Urls.model({ id: model.id, name: model.name }) : undefined}
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
          color={color("brand")}
          style={{ flexShrink: 0 }}
        />
        {children || (
          <EntityItem.Name
            name={model?.name || ""}
            variant="list"
            id={headingId}
          />
        )}
      </MaybeItemLink>
    </ItemNameCell>
  );
};

const TableLoader = () => (
  <tr>
    <td colSpan={4}>
      <Flex justify="center" color="text-light">
        {t`Loading…`}
      </Flex>
    </td>
  </tr>
);

const CellTextSkeleton = () => {
  return <Skeleton natural h="16.8px" />;
};

const TBodyRowSkeleton = ({ style }: { style?: CSSProperties }) => {
  const icon = { name: "model" as IconName };
  return (
    <ModelTableRow skeleton style={style}>
      {/* Name */}
      <NameCell icon={icon}>
        <CellTextSkeleton />
      </NameCell>

      {/* Collection */}
      <ModelCell {...collectionProps}>
        <Flex>
          <CollectionsIcon name="folder" />
          <CellTextSkeleton />
        </Flex>
      </ModelCell>

      {/* Description */}
      <ModelCell {...descriptionProps}>
        <CellTextSkeleton />
      </ModelCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </ModelTableRow>
  );
};
