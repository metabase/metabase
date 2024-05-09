import { useState } from "react";
import { t } from "ttag";

import EntityItem from "metabase/components/EntityItem";
import {
  SortableColumnHeader,
  type SortingOptions,
} from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemCell,
  ItemLink,
  ItemNameCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns, SortDirection } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocale } from "metabase/setup/selectors";
import { Icon, type IconProps } from "metabase/ui";
import type { ModelResult } from "metabase-types/api";

import { trackModelClick } from "../analytics";
import { getCollectionName, getIcon } from "../utils";

import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";
import { EllipsifiedWithMarkdown } from "./EllipsifiedWithMarkdown";
import { getModelDescription, sortModels } from "./utils";

export interface ModelsTableProps {
  models: ModelResult[];
}

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: "ItemsTableContainer",
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: "ItemsTableContainer",
};

const DEFAULT_SORTING_OPTIONS: SortingOptions = {
  sort_column: "collection",
  sort_direction: SortDirection.Asc,
};

export const ModelsTable = ({ models }: ModelsTableProps) => {
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;

  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const sortedModels = sortModels(models, sortingOptions, localeCode);

  return (
    <Table>
      <colgroup>
        {/* <col> for Name column */}
        <TableColumn style={{ width: "200px" }} />

        {/* <col> for Description column */}
        <TableColumn {...descriptionProps} />

        {/* <col> for Collection column */}
        <TableColumn {...collectionProps} />

        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <Columns.Name.Header
            sortingOptions={sortingOptions}
            onSortingOptionsChange={setSortingOptions}
          />
          <ColumnHeader {...descriptionProps}>{t`Description`}</ColumnHeader>
          <SortableColumnHeader
            name="collection"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={setSortingOptions}
            {...collectionProps}
          >
            {t`Collection`}
          </SortableColumnHeader>
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {sortedModels.map((model: ModelResult) => (
          <TBodyRow model={model} key={`${model.model}-${model.id}`} />
        ))}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({ model }: { model: ModelResult }) => {
  const icon = getIcon(model);
  const containerName = `collections-path-for-${model.id}`;

  return (
    <tr>
      {/* Name */}
      <NameCell
        model={model}
        icon={icon}
        onClick={() => {
          trackModelClick(model.id);
        }}
      />

      {/* Description */}
      <ItemCell {...descriptionProps}>
        <EllipsifiedWithMarkdown>
          {getModelDescription(model) || ""}
        </EllipsifiedWithMarkdown>
      </ItemCell>

      {/* Collection */}
      <ItemCell
        data-testid={`path-for-collection: ${
          model.collection
            ? getCollectionName(model.collection)
            : t`Untitled collection`
        }`}
        {...collectionProps}
      >
        {model.collection && (
          <CollectionBreadcrumbsWithTooltip
            containerName={containerName}
            collection={model.collection}
          />
        )}
      </ItemCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </tr>
  );
};

const NameCell = ({
  model,
  testIdPrefix = "table",
  onClick,
  icon,
}: {
  model: ModelResult;
  testIdPrefix?: string;
  onClick?: () => void;
  icon: IconProps;
}) => {
  const { id, name } = model;
  return (
    <ItemNameCell data-testid={`${testIdPrefix}-name`}>
      <ItemLink to={Urls.model({ id, name })} onClick={onClick}>
        <Icon
          size={16}
          {...icon}
          color={color("brand")}
          style={{ flexShrink: 0 }}
        />
        <EntityItem.Name name={model.name} variant="list" />
      </ItemLink>
    </ItemNameCell>
  );
};
