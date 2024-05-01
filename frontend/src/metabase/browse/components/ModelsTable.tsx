import { t } from "ttag";

import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { color } from "metabase/lib/colors";
import type { CollectionItem } from "metabase-types/api";

import { getCollectionName } from "../utils";

import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";
import { EllipsifiedWithMarkdown } from "./EllipsifiedWithMarkdown";
import { getModelDescription } from "./utils";

export interface ModelsTableProps {
  items: CollectionItem[];
  sortingOptions?: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
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
}: ModelsTableProps) => {
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
          <Columns.Type.Header
            title=""
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          />
          <Columns.Name.Header
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          />
          <ColumnHeader {...descriptionProps}>{t`Description`}</ColumnHeader>
          <ColumnHeader {...collectionProps}>{t`Collection`}</ColumnHeader>
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {items.map((item: CollectionItem) => (
          <TBodyRow item={item} key={`${item.model}-${item.id}`} />
        ))}
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

  return (
    <tr>
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
          />
        )}
      </ItemCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </tr>
  );
};
