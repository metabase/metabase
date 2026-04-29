import cx from "classnames";
import { type MouseEvent, useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { EntityItem } from "metabase/common/components/EntityItem";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import {
  ItemNameCell,
  MaybeItemLink,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/common/components/ItemsTable/utils";
import { Link } from "metabase/common/components/Link";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { getIcon } from "metabase/common/utils/icon";
import { useDispatch } from "metabase/redux";
import {
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Icon,
  Repeat,
  Skeleton,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { SortingOptions } from "metabase-types/api";

import BrowseTableS from "../components/BrowseTable.module.css";

import { trackModelClick } from "./analytics";
import type { ModelResult, SortColumn } from "./types";
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

const DEFAULT_SORTING_OPTIONS: SortingOptions<SortColumn> = {
  sort_column: "collection",
  sort_direction: "asc",
};

export const ModelsTable = ({
  models = [],
  skeleton = false,
}: ModelsTableProps) => {
  const [sortingOptions, setSortingOptions] = useState(DEFAULT_SORTING_OPTIONS);

  const sortedModels = sortModels(models, sortingOptions);

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 38.5;
  const descriptionWidth = 100 - collectionWidth;

  const handleUpdateSortOptions = skeleton
    ? undefined
    : (newSortingOptions: SortingOptions<SortColumn>) => {
        setSortingOptions(newSortingOptions);
      };

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models`}>
      <colgroup>
        {/* <col> for Name column */}
        <col className={BrowseTableS.nameColumn} />

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
      if (selection?.type === "Range" && selection?.toString().length > 0) {
        event.stopPropagation();
        return;
      }

      const { id, name } = model;
      const url = Urls.model({ id, name, type: "model" });
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
    <tr
      className={model ? BrowseTableS.tableRow : BrowseTableS.tableRowSkeleton}
      onClick={handleClick}
    >
      <NameCell model={model} />
      <CollectionCell model={model} />
      <DescriptionCell model={model} />
      <Columns.RightEdge.Cell />
    </tr>
  );
};

function NameCell({ model }: { model?: ModelResult }) {
  const headingId = `model-${model?.id || "dummy"}-heading`;
  const icon = getIcon(model ?? { model: "dataset" }) ?? { name: "folder" };
  return (
    <ItemNameCell data-testid="model-name" aria-labelledby={headingId}>
      <MaybeItemLink
        to={
          model
            ? Urls.model({ id: model.id, name: model.name, type: "model" })
            : undefined
        }
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
        onClick={preventDefault}
      >
        <Icon size={16} {...icon} c="icon-brand" style={{ flexShrink: 0 }} />
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
    <td
      className={cx(BrowseTableS.collectionCell, BrowseTableS.hideAtXs)}
      data-testid={`path-for-collection: ${collectionName}`}
    >
      {model?.collection ? (
        <Link
          className={BrowseTableS.collectionLink}
          to={Urls.collection(model.collection)}
          onClick={stopPropagation}
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </td>
  );
}

function DescriptionCell({ model }: { model?: ModelResult }) {
  return (
    <td className={cx(BrowseTableS.cell, BrowseTableS.hideAtSm)}>
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
    </td>
  );
}
