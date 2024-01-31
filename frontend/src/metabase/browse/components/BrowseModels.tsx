import { cloneElement, useContext, useEffect, useState } from "react";
import _ from "underscore";
import cx from "classnames";
import { c, t } from "ttag";
import { AutoSizer, type GridCellProps } from "react-virtualized";

import type {
  Card,
  CollectionEssentials,
  SearchResult,
} from "metabase-types/api";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import { space } from "metabase/styled-components/theme";
import { Box, Group, Icon, Text, Title } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";

import type { useSearchListQuery } from "metabase/common/hooks";

import { getCollectionName, groupModels, getPageWidth } from "../utils";
import { LastEdited } from "./LastEdited";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  CollectionHeaderContainer,
  CollectionHeaderGroup,
  CollectionHeaderLink,
  GridContainer,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";

import NoResults from "assets/img/no_results.svg";

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = [], error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  // This provides a ref to the <main> rendered by AppContent in App.tsx
  const contentViewport = useContext(ContentViewportContext);

  const rem = parseInt(space(2));
  const gridGapSize = rem;
  const itemMinWidth = 15 * rem;
  const defaultItemHeight = 10 * rem;
  const headerHeight = 3 * rem;
  let modelsFiltered = models.filter(
    model => !isInstanceAnalyticsCollection(model.collection),
  );
  modelsFiltered = [
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
    ...modelsFiltered,
  ];
  const groupsOfModels = groupModels(modelsFiltered, localeCode);

  useEffect(() => {
    const configureGrid = () => {
      if (!contentViewport) {
        return;
      }
      const gridOptions = getGridOptions(
        gridGapSize,
        itemMinWidth,
        contentViewport,
      );
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [models, gridGapSize, itemMinWidth, contentViewport]);

  const [gridOptions, setGridOptions] = useState<{
    columnCount: number;
    width: number;
    columnWidth: number;
  } | null>(null);

  if (error || isLoading || !gridOptions) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  const { columnCount } = gridOptions;

  const getRowHeight = ({ index: rowIndex }: { index: number }) => {
    const cellIndex = rowIndex * columnCount;
    return cellIsInHeaderRow(cells[cellIndex])
      ? headerHeight
      : defaultItemHeight;
  };

  const cellRenderer = (props: GridCellProps) =>
    renderItem({
      ...props,
      cells,
      columnCount,
    });

  if (gridOptions && modelsFiltered.length) {
    return ({ height }: { height: number }) => (
      <AutoSizer disableHeight>
        {() => (
          <GridContainer
            role="grid"
            data-testid="model-browser"
            columnCount={gridOptions.columnCount}
            rowCount={gridOptions.rowCount}
            width={gridOptions.width}
            columnWidth={gridOptions.columnWidth}
            gap={gridGapSize}
            autoHeight
            height={height}
            rowHeight={getRowHeight}
            cellRenderer={cellRenderer}
          >
            {groupsOfModels.map(groupOfModels => (
              <ModelGroup
                models={groupOfModels}
                key={`modelgroup-${groupOfModels[0].collection.id}`}
                localeCode={localeCode}
                columnCount={gridOptions.columnCount}
              />
            ))}
          </GridContainer>
        )}
      </AutoSizer>
    );
  }

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
};

type Cell = React.ReactElement | null;

const BlankCell = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);
const BlankCellInHeader = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);

const makeCells = (models: SearchResult[], columnCount: number): Cell[] => {
  const cells: Cell[] = [];
  for (
    let i = 0, columnIndex = 0;
    i < models.length;
    i++, columnIndex = (columnIndex + 1) % columnCount
  ) {
    const model = models[i];

    const collectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;

    const firstModelInItsCollection =
      i === 0 || collectionIdChanged || model.collection?.id === undefined;

    /** This id is used by aria-labelledby */
    const collectionHtmlId = model?.collection?.id
      ? `collection-${model.collection?.id}`
      : `item-${cells.length}`;

    // Before the first model in a given collection,
    // add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const header = (
        <CollectionHeader
          collection={model.collection}
          key={collectionHtmlId}
          id={collectionHtmlId}
        />
      );
      // // So that the collection header appears at the start of the row,
      // // add zero or more blank items to fill in the rest of the previous row
      // if (columnIndex > 0) {
      //   cells.push(...Array(columnCount - columnIndex).fill(<BlankCell />));
      // }
      // cells.push(header);
      // // Fill in the rest of the header row with blank items
      // cells.push(...Array(columnCount - 1).fill(<BlankCellInHeader />));
      // columnIndex = 0;
    }

    cells.push(
      <ModelCell
        collectionHtmlId={collectionHtmlId}
        key={`model-${model.id}`}
        model={model}
      />,
    );
  }
  return cells;
};

const getGridOptions = (
  gridGapSize: number,
  itemMinWidth: number,
  contentViewport: HTMLElement,
) => {
  const width = getPageWidth(contentViewport, gridGapSize);

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);

  return {
    columnCount,
    columnWidth,
    width,
  };
};

const cellIsInHeaderRow = (item: Cell) =>
  item?.type === CollectionHeader || item?.type === BlankCellInHeader;

type RenderItemFunction = (
  props: GridCellProps & {
    columnCount: number;
    gridGapSize?: number;
    groupLabel?: string;
    cells: Cell[];
  },
) => JSX.Element | null;

const renderItem: RenderItemFunction = ({
  columnCount,
  columnIndex,
  cells,
  rowIndex,
  style,
}) => {
  const index = rowIndex * columnCount + columnIndex;
  const cell = cells[index];
  return cell
    ? // Render the component with the style prop provided by the grid
      cloneElement(cell as React.ReactElement, { style })
    : null;
};

const ModelGroup = ({
  models,
  localeCode,
  columnCount,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
  columnCount: number;
}) => {
  const sortedModels = models.sort((a, b) => {
    if (!a.name && b.name) {
      return 1;
    }
    if (a.name && !b.name) {
      return -1;
    }
    if (!a.name && !b.name) {
      return 0;
    }
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return nameA.localeCompare(nameB, localeCode);
  });
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  return (
    <>
      <CollectionHeader
        collection={collection}
        key={collectionHtmlId}
        id={collectionHtmlId}
      />
      {
        // Fill in the rest of the header row with blank items
        Array(columnCount - 1).fill(<BlankCellInHeader />)
      }
      {sortedModels.map((model, index) => (
        <>
          <ModelCell
            model={model}
            collectionHtmlId={collectionHtmlId}
            key={`model-${model.id}`}
          />
          {
            // At the end of the group, add blank items to fill in the rest of the row
            index === sortedModels.length - 1 &&
              Array(columnCount - (sortedModels.length % columnCount)).fill(
                <BlankCell />,
              )
          }
        </>
      ))}
    </>
  );
};

interface ModelCellProps {
  model: SearchResult;
  collectionHtmlId: string;
}

const ModelCell = ({ model, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  const noDescription = c(
    "Indicates that a model has no description associated with it",
  ).t`No description.`;
  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Title order={4} className="text-wrap" lh="1rem" mb=".5rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <Text h="2rem" size="xs" mb="auto">
          <MultilineEllipsified
            tooltipMaxWidth="20rem"
            className={cx({ "text-light": !model.description })}
          >
            {model.description || noDescription}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEdited editorFullName={lastEditorFullName} timestamp={timestamp} />
      </ModelCard>
    </Link>
  );
};

const CollectionHeader = ({
  collection,
  id,
}: {
  collection: CollectionEssentials;
  id: string;
}) => {
  return (
    <CollectionHeaderContainer id={id} role="heading">
      <CollectionHeaderGroup grow noWrap>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          <Group spacing=".25rem">
            <Icon name="folder" color="text-dark" size={16} />
            <Text weight="bold">{getCollectionName(collection)}</Text>
          </Group>
        </CollectionHeaderLink>
      </CollectionHeaderGroup>
    </CollectionHeaderContainer>
  );
};
