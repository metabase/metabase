import { useEffect, useState } from "react";

import _ from "underscore";
import { t } from "ttag";

import type { GridCellProps } from "react-virtualized";

import {
  Grid as VirtualizedGrid,
  WindowScroller,
  AutoSizer,
} from "react-virtualized";
import type { CollectionItemWithLastEditedInfo } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import type { Collection, CollectionItem } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

import NoResults from "assets/img/no_results.svg";
import { Text } from "metabase/ui";
import {
  CenteredEmptyState,
  GridContainer,
  LastEditedInfoSeparator,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseData.styled";

interface ModelWithoutEditInfo extends CollectionItem {
  last_editor_common_name?: string | undefined;
  creator_common_name?: string | undefined;
  last_edited_at?: string | undefined;
  created_at?: string | undefined;
}

type Model = CollectionItemWithLastEditedInfo;

type RenderItemFunction = (
  props: GridCellProps & {
    columnCount: number;
    gridGapSize?: number;
    groupLabel?: string;
    items: GridItem[];
  },
) => JSX.Element | null;

/** The objects used to construct the grid. Most of these are models,
 * but there are other values added in, to generate headers and blank cells */
type GridItem = Model | HeaderGridItem | "blank" | "header-blank";

export const BrowseModels = ({
  data,
}: {
  data: ReturnType<typeof useSearchListQuery>;
}) => {
  const { data: models = [], error, isLoading } = data;

  const gridGapSize = 16;
  const itemMinWidth = 240; // TODO: replace magic number
  const defaultItemHeight = 160; // TODO: replace magic number?
  const headerHeight = 48; // TODO: replace magic number?

  useEffect(() => {
    const configureGrid = () => {
      const gridOptions = getGridOptions(models, gridGapSize, itemMinWidth);
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [models]);

  const [gridOptions, setGridOptions] = useState<{
    gridItems: GridItem[];
    width: number;
    columnWidth: number;
    columnCount: number;
    rowCount: number;
  } | null>(null);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }
  if (isLoading || !gridOptions) {
    return (
      <LoadingAndErrorWrapper loading style={{ display: "flex", flex: 1 }} />
    );
  }

  // TODO: Probably use a ref
  const scrollElement = document.getElementsByTagName("main")[0];

  const { gridItems: items, columnCount } = gridOptions;

  const getRowHeight = ({ index: rowIndex }: { index: number }) => {
    const cellIndex = rowIndex * columnCount;
    return gridItemIsInGroupHeaderRow(items[cellIndex])
      ? headerHeight
      : defaultItemHeight;
  };

  const cellRenderer = (props: GridCellProps) =>
    renderItem({
      ...props,
      items,
      columnCount,
    });

  return (
    <GridContainer>
      {items.length === 0 ? (
        <CenteredEmptyState
          title={t`No models here yet`}
          message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
          illustrationElement={<img src={NoResults} />}
        />
      ) : (
        <WindowScroller scrollElement={scrollElement}>
          {({ height, isScrolling, onChildScroll, scrollTop }) => (
            <AutoSizer disableHeight>
              {() => (
                <VirtualizedGrid
                  data-testid="model-browser"
                  {...gridOptions}
                  gap={gridGapSize}
                  autoHeight
                  height={height}
                  isScrolling={isScrolling}
                  scrollTop={scrollTop}
                  onScroll={onChildScroll}
                  rowHeight={getRowHeight}
                  cellRenderer={cellRenderer}
                />
              )}
            </AutoSizer>
          )}
        </WindowScroller>
      )}
    </GridContainer>
  );
};

const ModelCell = ({
  rowIndex,
  columnIndex,
  columnCount,
  items: models,
  style,
}: {
  rowIndex: number;
  columnIndex: number;
  columnCount: number;
  items: Model[];
  style: React.CSSProperties;
}) => {
  const index = rowIndex * columnCount + columnIndex;
  if (index >= models.length) {
    return null;
  }
  const model = models[index];
  return (
    <Link
      key={model.id}
      style={style}
      to={Urls.modelDetail(model)}
      // FIXME: Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
      data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
    >
      <ModelCard>
        <h4 className="text-wrap" style={{ lineHeight: "16px" }}>
          <MultilineEllipsified>{model.name}</MultilineEllipsified>
        </h4>
        <Text size="xs" style={{ height: "32px" }}>
          <MultilineEllipsified
            tooltipMaxWidth="100%"
            className={model.description ? "" : "text-light"}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEditInfoLabel
          prefix={null}
          item={model}
          fullName={model["last-edit-info"].full_name}
          className={"last-edit-info-label-button"}
          // TODO: Simplify the formatLabel prop
          formatLabel={(
            fullName: string | undefined = "",
            timeLabel: string | undefined = "",
          ) => (
            <>
              {fullName}
              {fullName && timeLabel ? (
                <LastEditedInfoSeparator>•</LastEditedInfoSeparator>
              ) : null}
              {timeLabel}
            </>
          )}
        />
      </ModelCard>
    </Link>
  );
};

const sortModels = (a: Model, b: Model) => {
  const fallbackSortValue = Number.MAX_SAFE_INTEGER;

  // Sort first on the name of the model's parent collection, case insensitive
  const collectionNameA = a.collection?.name.toLowerCase() || fallbackSortValue;
  const collectionNameB = b.collection?.name.toLowerCase() || fallbackSortValue;

  if (collectionNameA < collectionNameB) {
    return -1;
  }
  if (collectionNameA > collectionNameB) {
    return 1;
  }

  // If the two models' parent collections have the same name, sort on the id of the collection
  const collectionIdA = a.collection?.id ?? fallbackSortValue;
  const collectionIdB = b.collection?.id ?? fallbackSortValue;

  if (collectionIdA < collectionIdB) {
    return -1;
  }
  if (collectionIdA > collectionIdB) {
    return 1;
  }

  const nameA = a.name.toLowerCase() || fallbackSortValue;
  const nameB = b.name.toLowerCase() || fallbackSortValue;

  // If the two collection ids are the same, sort on the names of the models
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  // If the two models have the same name, sort on id
  const idA = a.id ?? fallbackSortValue;
  const idB = b.id ?? fallbackSortValue;

  if (idA < idB) {
    return -1;
  }
  if (idA > idB) {
    return 1;
  }

  return 0;
};

const ModelGroupHeader = ({
  groupLabel,
  style,
}: {
  groupLabel: string;
  style: React.CSSProperties;
}) => (
  <div className="model-group-header" style={{ ...style }}>
    <h4>{groupLabel}</h4>
  </div>
);

interface HeaderGridItem {
  collection: Collection | null | undefined;
}

const addHeadersToItems = (
  models: Model[],
  columnCount: number,
): GridItem[] => {
  const gridItems: GridItem[] = [];
  for (
    let i = 0, columnIndex = 0;
    i < models.length;
    i++, columnIndex = (columnIndex + 1) % columnCount
  ) {
    const model = models[i];

    const collectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;

    const firstModelInItsCollection =
      i === 0 || collectionIdChanged || !model.collection?.id;
    // Before the first model in a given collection,
    // add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const groupHeader: HeaderGridItem = {
        collection: model.collection,
      };
      gridItems.push(
        // So that the model group header appears at the start of the row,
        // add zero or more blank items to fill in the rest of the row
        ...(columnIndex > 0
          ? Array(columnCount - columnIndex).fill("blank")
          : []),
        groupHeader,
        // Fill in the rest of the header row with blank items
        ...Array(columnCount - 1).fill("header-blank"),
      );
      columnIndex = 0;
    }
    gridItems.push(model);
  }
  return gridItems;
};

const gridItemIsGroupHeader = (item: GridItem): item is HeaderGridItem =>
  item !== "blank" &&
  item !== "header-blank" &&
  (item as Model).model === undefined;

const gridItemIsInGroupHeaderRow = (item: GridItem) =>
  item === "header-blank" || gridItemIsGroupHeader(item);

const gridItemIsBlank = (item: GridItem) =>
  item === "blank" || item === "header-blank";

const getGridOptions = (
  models: ModelWithoutEditInfo[],
  gridGapSize: number,
  itemMinWidth: number,
) => {
  // TODO: use a ref
  const width =
    (document.querySelector("[data-testid='browse-data']")?.clientWidth ?? 0) -
    gridGapSize;

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  // // For testing, increase the number of models
  // if (models.length && models.length < 100) {
  //   for (let i = 0; i < 999; i++) {
  //     const pushMe = _.clone(models[i]);
  //     pushMe.name = pushMe.name.replace(/\s\(\d+\)$/, "");
  //     pushMe.name += ` (${i})`;
  //     models.push(pushMe);
  //   }
  // }

  // Sort models by (in descending order of priority): collection name, collection id, model name, model id.
  const modelsWithHistory: Model[] = models.map(
    (model: ModelWithoutEditInfo) => {
      const lastEditInfo = {
        full_name: model.last_editor_common_name ?? model.creator_common_name,
        timestamp: model.last_edited_at ?? model.created_at ?? "",
      };
      const item: Model = {
        ...model,
        "last-edit-info": lastEditInfo,
      };
      return item;
    },
  );
  const sortedModels = modelsWithHistory.sort(sortModels);

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);
  const gridItems = addHeadersToItems(sortedModels, columnCount);
  const rowCount = Math.ceil(gridItems.length / columnCount);

  return {
    columnCount,
    columnWidth,
    gridItems,
    rowCount,
    width,
  };
};

const renderItem: RenderItemFunction = ({
  columnCount,
  columnIndex,
  items,
  rowIndex,
  style,
}) => {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];
  if (!item) {
    return null;
  }
  if (gridItemIsBlank(item)) {
    return <div style={style}></div>;
  }
  if (gridItemIsGroupHeader(item)) {
    return (
      <ModelGroupHeader
        groupLabel={item.collection?.name || "Untitled collection"}
        style={style}
      />
    );
  } else {
    return (
      <ModelCell
        rowIndex={rowIndex}
        columnIndex={columnIndex}
        columnCount={columnCount}
        items={items as Model[]}
        style={style}
      />
    );
  }
};
