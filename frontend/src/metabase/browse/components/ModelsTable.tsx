import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { EllipsifiedPath } from "metabase/common/components/EllipsifiedPath";
import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import EntityItem from "metabase/components/EntityItem";
import {
  SortableColumnHeader,
  type SortingOptions,
} from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ItemLink,
  ItemNameCell,
  TBody,
  Table,
  TableColumn,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns, SortDirection } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon, type IconProps } from "metabase/ui";
import { Box, FixedSizeIcon } from "metabase/ui";

import { trackModelClick } from "../analytics";
import type { ModelResult } from "../types";
import { getIcon } from "../utils";

import { EllipsifiedWithMarkdownTooltip } from "./EllipsifiedWithMarkdownTooltip";
import S from "./ModelsTable.module.css";
import {
  ModelCell,
  ModelNameColumn,
  ModelTableRow,
} from "./ModelsTable.styled";
import {
  getCollectionPathString,
  getModelDescription,
  sortModels,
} from "./utils";

export interface ModelsTableProps {
  models: ModelResult[];
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

export const ModelsTable = ({ models = [] }: ModelsTableProps) => {
  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const locale = useLocale();
  const sortedModels = sortModels(models, sortingOptions, locale);

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  const handleUpdateSortOptions = (newSortingOptions: SortingOptions) => {
    setSortingOptions(newSortingOptions);
  };

  return (
    <Table aria-label={t`Table of models`}>
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
        {sortedModels.map((model: ModelResult) => (
          <TBodyRow model={model} key={`${model.model}-${model.id}`} />
        ))}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({ model }: { model: ModelResult }) => {
  const icon = getIcon(model);
  const dispatch = useDispatch();
  const { id, name } = model;

  return (
    <ModelTableRow
      onClick={(e: React.MouseEvent) => {
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
        <Link
          className={S.collectionLink}
          to={Urls.collection(model.collection)}
          onClick={e => e.stopPropagation()}
        >
          <Flex gap="sm">
            <FixedSizeIcon name="folder" />
            <Box w="calc(100% - 1.5rem)">
              <EllipsifiedPath
                tooltip={getCollectionPathString(model.collection)}
                items={[
                  ...(model.collection?.effective_ancestors || []),
                  model.collection,
                ].map(c => getCollectionName(c))}
              />
            </Box>
          </Flex>
        </Link>
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
}: {
  model: ModelResult;
  testIdPrefix?: string;
  onClick?: () => void;
  icon: IconProps;
}) => {
  const { id, name } = model;
  const headingId = `model-${id}-heading`;
  return (
    <ItemNameCell
      data-testid={`${testIdPrefix}-name`}
      aria-labelledby={headingId}
    >
      <ItemLink
        to={Urls.model({ id, name })}
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
        <EntityItem.Name name={model.name} variant="list" id={headingId} />
      </ItemLink>
    </ItemNameCell>
  );
};
