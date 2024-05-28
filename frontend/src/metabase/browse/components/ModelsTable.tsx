import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import EntityItem from "metabase/components/EntityItem";
import {
  SortableColumnHeader,
  type SortingOptions,
} from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ItemLink,
  ItemNameCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns, SortDirection } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocale } from "metabase/setup/selectors";
import type { IconProps } from "metabase/ui";
import { Flex, Icon } from "metabase/ui";
import type { ModelResult } from "metabase-types/api";

import { trackModelClick } from "../analytics";
import { getCollectionName, getIcon } from "../utils";

import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";
import { EllipsifiedWithMarkdownTooltip } from "./EllipsifiedWithMarkdownTooltip";
import {
  ModelCell,
  ModelNameColumn,
  ModelTableRow,
} from "./ModelsTable.styled";
import { RenderGradually } from "./RenderGradually";
import { getModelDescription, sortModels } from "./utils";

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

export const ModelsTable = ({ models }: ModelsTableProps) => {
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;

  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const sortedModels = sortModels(models, sortingOptions, localeCode);

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  return (
    <Table>
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
            onSortingOptionsChange={setSortingOptions}
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
            onSortingOptionsChange={setSortingOptions}
            {...collectionProps}
            columnHeaderProps={{
              style: {
                paddingInline: ".5rem",
              },
            }}
          >
            <Ellipsified lazy>{t`Collection`}</Ellipsified>
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
        <RenderGradually
          // Motivation for the RenderGradually pattern:
          // The table loads very slowly when there are 1K+ models.
          // It should be able to handle that many, since in large enterprises
          // a lot of users might use the CSV upload function to create a lot of models.
          // With this pattern, page load and sorting are fast and take O(1) time.
          // Contrast with other approaches:
          // * Virtualization and pagination:
          //      These might be worth exploring even though they prevent searching with Cmd+F.
          // * Simplifying the the table-row component when the model count is high:
          //      Easy to maintain, though with this approach, page load and
          //      sorting both are semi-slow and have worse than O(1) time.
          items={sortedModels}
          Loading={ModelsLoadingIndicator}
          key={JSON.stringify(sortingOptions)}
          enabled={false}
        >
          {items =>
            items.map(model => (
              <TBodyRow
                model={model}
                key={`model-${model.id}`}
                collectionContainerName="collection-container"
              />
            ))
          }
        </RenderGradually>
      </TBody>
    </Table>
  );
};

const TBodyRow = ({
  model,
  collectionContainerName,
}: {
  model: ModelResult;
  collectionContainerName: string;
}) => {
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
        trackModelClick(model.id);
      }}
      tabIndex={0}
      key={model.id}
    >
      {/* Name */}
      {
        <NameCell
          model={model}
          icon={icon}
          onClick={() => {
            trackModelClick(model.id);
          }}
        />
      }

      {/* Collection */}
      {
        <ModelCell
          data-testid={`path-for-collection: ${
            model.collection
              ? getCollectionName(model.collection)
              : t`Untitled collection`
          }`}
          {...collectionProps}
        >
          {model.collection && (
            <CollectionBreadcrumbsWithTooltip
              collection={model.collection}
              containerName={collectionContainerName}
            />
          )}
        </ModelCell>
      }

      {/* Description */}
      {
        <ModelCell {...descriptionProps}>
          <EllipsifiedWithMarkdownTooltip lazy>
            {getModelDescription(model) || ""}
          </EllipsifiedWithMarkdownTooltip>
        </ModelCell>
      }

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
  return (
    <ItemNameCell data-testid={`${testIdPrefix}-name`}>
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
          color={color("brand")}
          style={{ flexShrink: 0 }}
        />
        <EntityItem.Name name={model.name} variant="list" />
      </ItemLink>
    </ItemNameCell>
  );
};

const ModelsLoadingIndicator = () => {
  return (
    <tr>
      <td colSpan={99} style={{ backgroundColor: "transparent" }}>
        <Flex fw="bold" gap="sm" justify="center" align="center">
          {t`Loading…`}
        </Flex>
      </td>
    </tr>
  );
};
