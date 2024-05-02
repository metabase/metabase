import { push } from "react-router-redux";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import {
  SortableColumnHeader,
  type SortingOptions,
} from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import { getCollectionName } from "../utils";

import { CenteredEmptyState } from "./BrowseApp.styled";
import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";
import { EllipsifiedWithMarkdown } from "./EllipsifiedWithMarkdown";
import {
  LoadingAndErrorWrapperTableRow,
  ModelTableRow,
} from "./ModelsTable.styled";
import { getModelDescription } from "./utils";

export interface ModelsTableProps {
  items?: CollectionItem[];
  sortingOptions?: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
  error?: any;
  isLoading?: boolean;
}

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: "ItemsTableContainer",
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: "ItemsTableContainer",
};

export const ModelsTable = ({
  items,
  sortingOptions,
  onSortingOptionsChange,
  error,
  isLoading,
}: ModelsTableProps) => {
  if (items?.length === 0) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No models here yet`}</Box>}
        message={
          <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
        }
        illustrationElement={
          <Box mb=".5rem">
            <img src={NoResults} />
          </Box>
        }
      />
    );
  }

  return (
    <Table>
      <colgroup>
        <Columns.Type.Col />

        {/* <col> for Name column */}
        <TableColumn style={{ width: "10rem" }} />

        {/* <col> for Description column */}
        <TableColumn {...descriptionProps} />

        {/* <col> for Collection column */}
        <TableColumn {...collectionProps} />

        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <Columns.Type.Header title="" />
          <Columns.Name.Header
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          />
          <ColumnHeader {...descriptionProps}>{t`Description`}</ColumnHeader>
          <SortableColumnHeader
            name="collection"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
            {...collectionProps}
          >
            {t`Collection`}
          </SortableColumnHeader>
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {error || isLoading ? (
          <LoadingAndErrorWrapperTableRow>
            <td colSpan={5}>
              <DelayedLoadingAndErrorWrapper
                error={error}
                loading={!!isLoading}
              />
            </td>
          </LoadingAndErrorWrapperTableRow>
        ) : (
          items?.map((item: CollectionItem) => (
            <TBodyRow item={item} key={`${item.model}-${item.id}`} />
          ))
        )}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({ item }: { item: CollectionItem }) => {
  const icon = item.getIcon();
  if (item.model === "card") {
    icon.color = color("text-light");
  }

  const containerName = `collections-path-for-${item.id}`;
  const dispatch = useDispatch();
  const stopClickPropagation = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <ModelTableRow
      onClick={() => {
        // TODO: Support control-click to open in new tab
        dispatch(push(item.getUrl()));
      }}
      tabIndex={0}
      key={item.id}
    >
      {/* Type */}
      <Columns.Type.Cell icon={icon} />

      {/* Name */}
      <Columns.Name.Cell item={item} includeDescription={false} />

      {/* Description */}
      <ItemCell {...descriptionProps}>
        <EllipsifiedWithMarkdown>
          {getModelDescription(item) || ""}
        </EllipsifiedWithMarkdown>
      </ItemCell>

      {/* Collection */}
      <ItemCell
        data-testid={`path-for-collection: ${
          item.collection
            ? getCollectionName(item.collection)
            : t`Untitled collection`
        }`}
        {...collectionProps}
      >
        {item.collection && (
          <CollectionBreadcrumbsWithTooltip
            containerName={containerName}
            collection={item.collection}
            // To avoid propagating the click event to the ModelTableRow
            breadcrumbGroupProps={stopClickPropagation}
            collectionsIconProps={stopClickPropagation}
          />
        )}
      </ItemCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </ModelTableRow>
  );
};
