import { type MouseEvent, useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
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
import { MarkdownPreview } from "metabase/core/components/MarkdownPreview";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { FixedSizeIcon, Flex, Icon, Skeleton } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import {
  Cell,
  CollectionLink,
  CollectionTableCell,
  NameColumn,
  TableRow,
} from "../components/BrowseTable.styled";

import { trackModelClick } from "./analytics";
import type { ModelResult } from "./types";
import { getIcon, getModelDescription, sortModels } from "./utils";

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

  const sortedModels = sortModels(models, sortingOptions);

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
            <ModelRow />
          </Repeat>
        ) : (
          sortedModels.map((model: ModelResult) => (
            <ModelRow model={model} key={model.id} />
          ))
        )}
      </TBody>
    </Table>
  );
};

function SkeletonText() {
  return <Skeleton natural h="16.8px" />;
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

function preventDefault(event: MouseEvent) {
  event.preventDefault();
}

const ModelRow = ({ model }: { model?: ModelResult }) => {
  const dispatch = useDispatch();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!model) {
        return;
      }

      // do not trigger click when selecting text
      const selection = document.getSelection();
      if (selection?.type === "Range") {
        event.stopPropagation();
        return;
      }

      const { id, name } = model;
      const url = Urls.model({ id, name });
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

      trackModelClick(model.id);

      event.preventDefault();
      event.stopPropagation();

      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        Urls.openInNewTab(subpathSafeUrl);
      } else {
        dispatch(push(url));
      }
    },
    [model, dispatch],
  );

  return (
    <TableRow onClick={handleClick}>
      <NameCell model={model} />
      <CollectionCell model={model} />
      <DescriptionCell model={model} />
      <Columns.RightEdge.Cell />
    </TableRow>
  );
};

function NameCell({ model }: { model?: ModelResult }) {
  const headingId = `model-${model?.id || "dummy"}-heading`;
  const icon = getIcon(model);
  return (
    <ItemNameCell data-testid="model-name" aria-labelledby={headingId}>
      <MaybeItemLink
        to={model ? Urls.model({ id: model.id, name: model.name }) : undefined}
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
        onClick={preventDefault}
      >
        <Icon
          size={16}
          {...icon}
          color="var(--mb-color-icon-primary)"
          style={{ flexShrink: 0 }}
        />
        {
          <EntityItem.Name
            name={model?.name || ""}
            variant="list"
            id={headingId}
          />
        }
      </MaybeItemLink>
    </ItemNameCell>
  );
}

function CollectionCell({ model }: { model?: ModelResult }) {
  const collectionName = model?.collection
    ? getCollectionName(model.collection)
    : t`Untitled collection`;

  const content = (
    <Flex gap="sm">
      <FixedSizeIcon name="folder" />

      {model ? (
        <EllipsifiedCollectionPath collection={model.collection} />
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
      {model?.collection ? (
        <CollectionLink
          to={Urls.collection(model.collection)}
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

function DescriptionCell({ model }: { model?: ModelResult }) {
  return (
    <Cell {...descriptionProps}>
      {model ? (
        <MarkdownPreview
          lineClamp={12}
          allowedElements={["strong", "em"]}
          oneLine
        >
          {getModelDescription(model) || ""}
        </MarkdownPreview>
      ) : (
        <SkeletonText />
      )}
    </Cell>
  );
}
