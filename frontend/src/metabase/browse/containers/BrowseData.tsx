/* Questions for Kyle
 * - Do you have any suggestions about how the grid of models should adapt to a narrow viewport? Maybe a CSS-grid type solution would work here?
 *
 * Questions for backend team
 * - The max number of results shown in /api/search is 1000 (I believe, due to https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/search/config.clj#L30-L32 and https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/api/search.clj#L471). To definitely retrieve all the models, would it make sense to poll continually, increasing the offset by 1000, until a page with fewer than 1000 results is returned?
 * */

import { useEffect, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import styled from "@emotion/styled";
import type { Collection, CollectionItem } from "metabase-types/api";
import { Divider, Flex, Tabs, Icon, Text } from "metabase/ui";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { Grid } from "metabase/components/Grid";

import Link from "metabase/core/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import type { CollectionItemWithLastEditedInfo } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import NoResults from "assets/img/no_results.svg";
import type { VirtualizedGridItemProps } from "metabase/components/VirtualizedGrid/VirtualizedGrid";
import { VirtualizedGrid } from "metabase/components/VirtualizedGrid/VirtualizedGrid";
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import {
  DatabaseCard,
  DatabaseGridItem,
  MultilineEllipsified,
  LastEditedInfoSeparator,
  ModelCard,
} from "./BrowseData.styled";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

type ModelWithoutEditInfo = CollectionItem;

type Model = CollectionItemWithLastEditedInfo;

export const BrowseDataPage = () => {
  const idOfInitialTab = "models";
  const [currentTabId, setTabId] = useState<string | null>(idOfInitialTab);

  const {
    data: models = [],
    error: errorLoadingModels,
    isLoading: isModelListLoading,
  } = useSearchListQuery({
    query: {
      models: ["dataset"],
    },
    reload: true,
  });

  const {
    data: databases = [],
    error: errorLoadingDatabases,
    isLoading: isDatabaseListLoading,
  } = useDatabaseListQuery({
    reload: true,
  });

  const tabs: Record<string, BrowseDataTab> = {
    models: {
      label: t`Models`,
      component: (
        <ModelsTab
          models={models}
          isLoading={isModelListLoading}
          error={errorLoadingModels}
        />
      ),
    },
    databases: {
      label: t`Databases`,
      component: (
        <DatabasesTab
          databases={databases}
          isLoading={isDatabaseListLoading}
          error={errorLoadingDatabases}
        />
      ),
    },
  };
  // TODO: Fix font of BrowseHeader
  // TODO: Do we still need 'Learn about our data?'
  const currentTab = currentTabId ? tabs[currentTabId] : null;
  return (
    <div
      data-testid="database-browser"
      style={{
        display: "flex",
        flex: 1,
        flexFlow: "column nowrap",
      }}
    >
      <h2
        className="text-dark"
        style={{ marginBottom: ".35rem" }}
      >{t`Browse data`}</h2>
      <Tabs
        value={currentTabId}
        onTabChange={setTabId}
        style={{
          display: "flex",
          flexFlow: "column nowrap",
          flex: 1,
        }}
      >
        <Flex>
          <Tabs.List>
            {Object.entries(tabs).map(([tabId, tab]) => (
              <Tabs.Tab key={tabId} value={tabId}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Flex>
        <Divider />
        {currentTab && (
          <Tabs.Panel
            key={currentTabId}
            value={currentTabId ?? ""}
            style={{ display: "flex", flexFlow: "column nowrap", flex: 1 }}
          >
            {currentTab.component}
          </Tabs.Panel>
        )}
      </Tabs>
    </div>
  );
};

// NOTE: The minimum mergeable version does not need to include the verified badges

const ModelsTab = ({
  models,
  error,
  isLoading,
}: {
  models: ModelWithoutEditInfo[];
  isLoading: boolean;
  error: unknown;
}) => {
  const gridGapSize = 16;
  const itemMinWidth = 240; // TODO: replace magic number
  const itemHeight = 160; // TODO: replace magic number?

  useEffect(() => {
    // TODO: Is a browser font size change a resize?
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
      <GridContainer>
        <LoadingAndErrorWrapper loading />
      </GridContainer>
    );
  }

  const renderItem = ({
    rowIndex,
    columnIndex,
    columnCount,
    items,
    style,
  }: VirtualizedGridItemProps<GridItem>) => {
    const index = rowIndex * columnCount + columnIndex;
    const item = items[index];
    if (!item) {
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

  return (
    <GridContainer>
      {gridOptions?.gridItems.length ? (
        <VirtualizedGrid
          width={gridOptions.width}
          columnWidth={gridOptions.columnWidth}
          columnCount={gridOptions.columnCount}
          rowCount={gridOptions.rowCount}
          items={gridOptions.gridItems}
          itemHeight={itemHeight}
          gridGapSize={gridGapSize}
          renderItem={renderItem}
          // TODO: Probably use a ref
          scrollElement={document.getElementsByTagName("main")[0]}
        />
      ) : (
        <ContentOfEmptyTab
          title={t`No models here yet`}
          message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
        />
      )}
    </GridContainer>
  );
};

const GridContainer = styled.div`
  flex: 1;
  width: 100%;

  > div {
    height: unset !important;
  }

  overflow: hidden !important;

  .ReactVirtualized__Grid,
  .ReactVirtualized__Grid__innerScrollContainer {
    overflow: visible !important;
  }

  .model-group-header {
    border-top: 1px solid #f0f0f0;
    display: flex;
    flex-flow: column nowrap;
    justify-content: flex-end;
    padding-bottom: 1rem;
  }
`;

const DatabasesTab = ({
  databases,
  error,
  isLoading,
}: {
  databases: IDatabase[];
  error: unknown;
  isLoading: boolean;
}) => {
  if (error) {
    return <LoadingAndErrorWrapper error />;
  }
  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }
  if (!databases.length) {
    return <ContentOfEmptyTab title={t`No databases here yet`} />;
  }
  return (
    <Grid>
      {databases.map(database => (
        <DatabaseGridItem key={database.id}>
          <Link
            to={Urls.browseDatabase(database)}
            data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
          >
            <DatabaseCard>
              <Icon
                name="database"
                color={color("accent2")}
                className="mb3"
                size={32}
              />
              <h3 className="text-wrap">{database.name}</h3>
            </DatabaseCard>
          </Link>
        </DatabaseGridItem>
      ))}
    </Grid>
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
    <div key={model.id} style={{ ...style, paddingRight: "16px" }}>
      <Link
        to={Urls.modelDetail(model)}
        // Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
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
    </div>
  );
};

const ContentOfEmptyTab = ({
  title,
  message = "",
}: {
  title: string;
  message?: string;
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        height: "100%",
        width: "100%",
      }}
    >
      <EmptyState
        title={title}
        message={message}
        illustrationElement={<img src={NoResults} />}
      />
    </div>
  );
};

const sortModels = (a: Model, b: Model) => {
  const sortLast = Number.MAX_SAFE_INTEGER; // assume sortLast is a fallback value for sorting
  const nameA = a.name || sortLast;
  const nameB = b.name || sortLast;

  // Sort first on the name of the model's parent collection
  const collectionNameA = a.collection?.name || sortLast;
  const collectionNameB = b.collection?.name || sortLast;

  if (collectionNameA < collectionNameB) {
    return -1;
  }
  if (collectionNameA > collectionNameB) {
    return 1;
  }

  // If the two models' parent collections have the same name, sort on the id of the collection
  const collectionIdA = a.collection?.id ?? sortLast;
  const collectionIdB = b.collection?.id ?? sortLast;

  if (collectionIdA < collectionIdB) {
    return -1;
  }
  if (collectionIdA > collectionIdB) {
    return 1;
  }

  // If the two collection ids are the same, sort on the names of the models
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  // If the two models have the same name, sort on id
  const idA = a.id ?? sortLast;
  const idB = b.id ?? sortLast;

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
}) => {
  return (
    <div className="model-group-header" style={{ ...style, width: "100%" }}>
      <h4>{groupLabel}</h4>
    </div>
  );
};

interface HeaderGridItem {
  collection: Collection | null | undefined;
}

/** The objects used to construct the grid.
 * Most of these are models but there are other objects added in too,
 * to generate headers and blank cells (represented by null). */
type GridItem = Model | HeaderGridItem | null;

const makeBlankItems = (count: number) => Array(count).fill(null);

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
    const connectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;
    const firstModelInItsCollection =
      i === 0 || connectionIdChanged || !model.collection?.id;
    // Before the first model in a given collection, add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const groupHeader: HeaderGridItem = {
        collection: model.collection,
      };
      gridItems.push(
        // So that the model group header appears at the start of the row,
        // add zero or more blank items to fill in the rest of the row
        ...(columnIndex > 0 ? makeBlankItems(columnCount - columnIndex) : []),
        groupHeader,
        // Fill in the rest of the row with blank items
        ...makeBlankItems(columnCount - 1),
      );
    }
    gridItems.push(model);
  }
  return gridItems;
};

const gridItemIsGroupHeader = (item: GridItem): item is HeaderGridItem =>
  item !== null && (item as Model).model === undefined;

const getGridOptions = (
  models: ModelWithoutEditInfo[],
  gridGapSize: number,
  itemMinWidth: number,
) => {
  // TODO: use a ref
  const width =
    document.querySelector("[data-testid='browse-data']")?.clientWidth ?? 0;

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  // For testing, increase the number of models
  if (models.length && models.length < 100) {
    for (let i = 0; i < 999; i++) {
      const pushMe = _.clone(models[i]);
      pushMe.name = pushMe.name.replace(/\s\(\d+\)$/, "");
      pushMe.name += ` (${i})`;
      models.push(pushMe);
    }
  }

  // Sort models by (in descending order of priority): collection name, collection id, model name, model id.
  const modelsWithEditInfo: Model[] = models.map(
    (model: ModelWithoutEditInfo) => {
      const lastEditInfo = {
        full_name: model.last_editor_common_name ?? model.creator_common_name,
        timestamp: model.last_edited_at ?? model.created_at,
      };
      const item: Model = {
        ...model,
        "last-edit-info": lastEditInfo,
      };
      return item;
    },
  );
  const sortedModels = modelsWithEditInfo.sort(sortModels);

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);
  const gridItems = addHeadersToItems(sortedModels, columnCount);
  const rowCount = Math.ceil(gridItems.length / columnCount);
  return {
    gridItems,
    width,
    columnWidth,
    columnCount,
    rowCount,
  };
};
