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
  TableColumn,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
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

import { trackModelClick } from "../analytics";
import type { ModelResult } from "../types";
import { getIcon } from "../utils";

import { Cell, NameColumn, TableRow } from "./CardTable.styled";
import { EllipsifiedWithMarkdownTooltip } from "./EllipsifiedWithMarkdownTooltip";
import S from "./ModelsTable.module.css";
import { getModelDescription, sortCards } from "./utils";

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

export const ModelsTable = ({
  models = [],
  skeleton = false,
}: ModelsTableProps) => {
  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const locale = useLocale();
  const sortedModels = sortCards(models, sortingOptions, locale);

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  const handleUpdateSortOptions = skeleton
    ? undefined
    : (newSortingOptions: SortingOptions) => {
        setSortingOptions(newSortingOptions);
      };

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models`}>
      <colgroup>
        {/* <col> for Name column */}
        <NameColumn containerName={itemsTableContainerName} />

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
        {skeleton ? (
          <Repeat times={7}>
            <TBodyRowSkeleton />
          </Repeat>
        ) : (
          sortedModels.map((model: ModelResult) => (
            <TBodyRow model={model} key={`${model.model}-${model.id}`} />
          ))
        )}
      </TBody>
    </Table>
  );
};

const TBodyRow = ({
  model,
  skeleton,
}: {
  model: ModelResult;
  skeleton?: boolean;
}) => {
  const icon = getIcon(model);
  const dispatch = useDispatch();
  const { id, name } = model;

  return (
    <TableRow
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        const url = Urls.model({ id, name });
        const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

        if ((e.ctrlKey || e.metaKey) && e.button === 0) {
          Urls.openInNewTab(subpathSafeUrl);
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
      <Cell
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
              <EllipsifiedCollectionPath collection={model.collection} />
            </Box>
          </Flex>
        </Link>
      </Cell>

      {/* Description */}
      <Cell {...descriptionProps}>
        <EllipsifiedWithMarkdownTooltip>
          {getModelDescription(model) || ""}
        </EllipsifiedWithMarkdownTooltip>
      </Cell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </TableRow>
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
          color={"var(--mb-color-brand)"}
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

const CellTextSkeleton = () => {
  return <Skeleton natural h="16.8px" />;
};

const TBodyRowSkeleton = ({ style }: { style?: CSSProperties }) => {
  const icon = { name: "model" as IconName };
  return (
    <TableRow skeleton style={style}>
      {/* Name */}
      <NameCell icon={icon}>
        <CellTextSkeleton />
      </NameCell>

      {/* Collection */}
      <Cell {...collectionProps}>
        <Flex gap=".5rem">
          <FixedSizeIcon name="folder" />
          <CellTextSkeleton />
        </Flex>
      </Cell>

      {/* Description */}
      <Cell {...descriptionProps}>
        <CellTextSkeleton />
      </Cell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </TableRow>
  );
};
