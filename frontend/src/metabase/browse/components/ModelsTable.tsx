import { t } from "ttag";

import EntityItem from "metabase/components/EntityItem";
import {
  ColumnHeader,
  ItemCell,
  ItemLink,
  ItemNameCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon, type IconProps } from "metabase/ui";
import type { Card, SearchResult } from "metabase-types/api";

import { trackModelClick } from "../analytics";
import { getCollectionName, getIcon } from "../utils";

import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";
import { EllipsifiedWithMarkdown } from "./EllipsifiedWithMarkdown";
import { getModelDescription } from "./utils";

export interface ModelsTableProps {
  items: SearchResult[];
}

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: "ItemsTableContainer",
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: "ItemsTableContainer",
};

export const ModelsTable = ({ items }: ModelsTableProps) => {
  return (
    <Table>
      <colgroup>
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
          <Columns.Name.Header />
          <ColumnHeader {...descriptionProps}>{t`Description`}</ColumnHeader>
          <ColumnHeader {...collectionProps}>{t`Collection`}</ColumnHeader>
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {items.map((item: SearchResult) => (
          <TBodyRow item={item} key={`${item.model}-${item.id}`} />
        ))}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({ item }: { item: SearchResult }) => {
  const icon = getIcon(item);
  if (item.model === "card") {
    icon.color = color("text-light");
  }

  const containerName = `collections-path-for-${item.id}`;

  return (
    <tr>
      {/* Name */}
      <NameCell
        item={item}
        icon={icon}
        onClick={() => {
          trackModelClick(item.id);
        }}
      />

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

const NameCell = ({
  item,
  testIdPrefix = "table",
  onClick,
  icon,
}: {
  item: SearchResult;
  testIdPrefix?: string;
  onClick?: () => void;
  icon: IconProps;
}) => {
  return (
    <ItemNameCell data-testid={`${testIdPrefix}-name`}>
      <ItemLink
        to={Urls.model(item as unknown as Partial<Card>)}
        onClick={onClick}
      >
        <Icon
          size={16}
          {...icon}
          color={color("brand")}
          style={{ flexShrink: 0 }}
        />
        <EntityItem.Name name={item.name} variant="list" />
      </ItemLink>
    </ItemNameCell>
  );
};
