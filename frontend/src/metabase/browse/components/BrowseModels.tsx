import { cloneElement, useContext, useEffect, useMemo, useState } from "react";
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

import NoResults from "assets/img/no_results.svg";
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

const emptyArray: SearchResult[] = [];

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = emptyArray, error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  // This provides a ref to the <main> rendered by AppContent in App.tsx
  const contentViewport = useContext(ContentViewportContext);

  const rem = parseInt(space(2));
  const gridGapSize = rem;
  const itemMinWidth = 15 * rem;
  const defaultItemHeight = 10 * rem;
  const headerHeight = 3 * rem;

  const groupsOfModels: SearchResult[][] = useMemo(() => {
    const modelsFiltered = models.filter(
      model => !isInstanceAnalyticsCollection(model.collection),
    );
    // modelsFiltered = [
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    //   ...modelsFiltered,
    // ];
    return groupModels(modelsFiltered, localeCode);
  }, [models, localeCode]);

  useEffect(() => {
    const configureGrid = () => {
      if (!contentViewport) {
        return;
      }
      const gridOptions = getGridOptions({
        groupsOfModels,
        gridGapSize,
        itemMinWidth,
        contentViewport,
        localeCode,
      });
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [groupsOfModels, gridGapSize, itemMinWidth, contentViewport, localeCode]);

  // TODO: Use a callback function for setGridOptions

  const [gridOptions, setGridOptions] = useState<{
    columnCount: number;
    width: number;
    columnWidth: number;
    cells: Cell[];
    rowCount: number;
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

  const { cells, columnCount, rowCount, width, columnWidth } = gridOptions;

  const cellRenderer = (props: GridCellProps) =>
    renderItem({
      ...props,
      cells,
      columnCount,
    });

  const getRowHeight = ({ index: rowIndex }: { index: number }) => {
    const cellIndex = rowIndex * columnCount;
    return cellIsInHeaderRow(cells[cellIndex])
      ? headerHeight
      : defaultItemHeight;
  };

  if (groupsOfModels.length) {
    return (
      <AutoSizer disableHeight>
        {({ height }: { height: number }) => (
          <GridContainer
            role="grid"
            data-testid="model-browser"
            columnCount={columnCount}
            rowCount={rowCount}
            width={width}
            columnWidth={columnWidth}
            gap={gridGapSize}
            autoHeight
            height={height || 100}
            rowHeight={getRowHeight}
            cellRenderer={cellRenderer}
          />
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

type Cell = JSX.Element;

const BlankCell = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);
const BlankCellInHeader = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);

const getGridOptions = ({
  groupsOfModels,
  gridGapSize,
  itemMinWidth,
  contentViewport,
  localeCode,
}: {
  groupsOfModels: SearchResult[][];
  gridGapSize: number;
  itemMinWidth: number;
  contentViewport: HTMLElement;
  localeCode?: string;
}) => {
  const width = getPageWidth(contentViewport, gridGapSize);

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);

  const cells: Cell[] = groupsOfModels.flatMap(
    (groupOfModels: SearchResult[]) =>
      getCellsForGroup({ models: groupOfModels, localeCode, columnCount }),
  );
  const rowCount = Math.ceil(cells.length / columnCount);

  return {
    cells,
    columnCount,
    columnWidth,
    width,
    rowCount,
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
) => Cell | null;

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

const getCellsForGroup = ({
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

  const cells: Cell[] = [];

  cells.push(
    <CollectionHeader
      collection={collection}
      key={collectionHtmlId}
      id={collectionHtmlId}
    />,
  );
  // Fill in the rest of the header row with blank items
  cells.push(...Array(columnCount - 1).fill(<BlankCellInHeader />));
  for (let m = 0; m < sortedModels.length; m++) {
    const model = sortedModels[m];
    cells.push(
      <ModelCell
        model={model}
        collectionHtmlId={collectionHtmlId}
        key={`model-${model.id}`}
      />,
    );
    // At the end of the group, add blank items to fill in the rest of the row
    const endOfLoop = m === sortedModels.length - 1;
    if (endOfLoop) {
      const countOfModelsInLastRowOfGroup = sortedModels.length % columnCount;
      const blankCellsNeeded = columnCount - countOfModelsInLastRowOfGroup;
      for (let i = 0; i < blankCellsNeeded; i++) {
        cells.push(<BlankCell />);
      }
    }
  }
  return cells;
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
