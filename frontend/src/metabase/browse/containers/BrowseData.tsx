/* Questions for Kyle
 * - Do you have any suggestions about how the grid of models should adapt to a narrow viewport? Maybe a CSS-grid type solution would work here?
 *
 * Questions for backend team
 * - The max number of results shown in /api/search is 1000 (I believe, due to https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/search/config.clj#L30-L32 and https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/api/search.clj#L471). To definitely retrieve all the models, would it make sense to poll continually, increasing the offset by 1000, until a page with fewer than 1000 results is returned?
 * */

import { useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
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
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import {
  DatabaseCard,
  DatabaseGridItem,
  MultilineEllipsified,
  LastEditedInfoSeparator,
  ModelCard,
} from "./BrowseData.styled";
import {
  VirtualizedGrid,
  VirtualizedGridItemProps,
} from "metabase/components/VirtualizedGrid/VirtualizedGrid";
import styled from "@emotion/styled";

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

  const gridItems: GridItem[] = useMemo(() => {
    // For testing, increase the number of models
    if (models.length) {
      for (let i = 0; i < 99; i++) {
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
    const modelsWithHeaders = addCellsForGroupHeaders(sortedModels);
    return modelsWithHeaders;
  }, [models.length]);

  console.log("gridItems.length", gridItems.length);

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
          items={gridItems}
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
  items,
  error,
  isLoading,
}: {
  /* The objects used to construct the grid. Most of these are models but there are some header objects added in too, in the right places. These are used to generate the headers */
  items: GridItem[];
  isLoading: boolean;
  error: unknown;
}) => {
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (gridContainerRef?.current) {
        // TODO: use a ref
        const width = document.querySelector("[data-testid='browse-data']")?.clientWidth ?? 0;
        console.log('container width set to', width);
        const columnCount = calculateColumnCount(width);
        const rowCount = Math.ceil(items.length / columnCount);
        const columnWidth = calculateItemWidth(width, columnCount);
        setGridOptions({
          width,
          columnWidth,
          columnCount,
          rowCount,
        });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [gridContainerRef?.current]);

  const [gridOptions, setGridOptions] = useState<{
    width: number;
    columnWidth: number;
    columnCount: number;
    rowCount: number;
  } | null>(null);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }
  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }
  const gridGapSize = 16;

  const renderItem = (props: VirtualizedGridItemProps<GridItem>) => {
    const { rowIndex, columnIndex, columnCount, items } = props;
    const index = rowIndex * columnCount + columnIndex;
    const item = items[index];
    if (!item) return <></>; // TODO: This is a workaround because sometimes item is undefined, see if you can remove this
    if (gridItemIsGroupHeader(item)) {
      return (
        <ModelGroupHeader
          {...(props as VirtualizedGridItemProps<HeaderGridItem>)}
          groupLabel={`${item.collection?.name || "Untitled collection"} (${
            item.collection?.id ?? "no id"
          })`}
          gridGapSize={gridGapSize}
        />
      );
    } else {
      return (
        <ModelCell
          {...(props as VirtualizedGridItemProps<Model>)}
          gridGapSize={gridGapSize}
        />
      );
    }
  };

  const itemMinWidth = 240; // TODO: replace magic number
  const itemHeight = 160; // TODO: replace magic number?

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  console.log('gridOptions.width', gridOptions?.width);

  return (
    <GridContainer ref={gridContainerRef}>
      {items.length && gridOptions ? (
        <VirtualizedGrid
          width={gridOptions.width}
          columnWidth={gridOptions.columnWidth}
          columnCount={gridOptions.columnCount}
          rowCount={gridOptions.rowCount}
          items={items}
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

  overflow: hidden ! important;

  .ReactVirtualized__Grid,
  .ReactVirtualized__Grid__innerScrollContainer {
    overflow: visible !important;
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

// const ModelGroup = ({
//   collectionName,
//   models,
//   includeDivider = true,
// }: {
//   collectionName: string;
//   models: Model[];
//   includeDivider?: boolean;
// }) => {
//   return (
//     <>
//       {includeDivider && <Divider />}
//       <div
//         style={{
//           padding: "1rem 0",
//           flexFlow: "column nowrap",
//           width: "100%",
//           display: "flex",
//         }}
//       >
//         <h4 style={{ width: "100%" }}>{collectionName}</h4>
//         <ModelGroupGrid>
//           {/* TODO: Type the `model` var*/}
//           {models.map((model: any) => {
//             // If there is no information about the last edit,
//             // use the timestamp of the creation
//             const lastEditInfo = {
//               full_name:
//                 model.last_editor_common_name ?? model.creator_common_name,
//               timestamp: model.last_edited_at ?? model.created_at,
//             };
//             const item: CollectionItemWithLastEditedInfo = {
//               ...model,
//               "last-edit-info": lastEditInfo,
//             };
//             return <ModelItem model={item}/>
//           })}
//         </ModelGroupGrid>
//       </div>
//     </>
//   );
// };

const ModelCell = (props: VirtualizedGridItemProps<Model>) => {
  const { rowIndex, columnIndex, columnCount, items: models, style } = props;
  const index = rowIndex * columnCount + columnIndex;
  if (index >= models.length) return null;
  const model = models[index];

  // TODO: temporary workaround
  if (!model) {
    console.log("model is undefined");
    return null;
  }
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

  if (collectionNameA < collectionNameB) return -1;
  if (collectionNameA > collectionNameB) return 1;

  // If the two models' parent collections have the same name, sort on the id of the collection
  const collectionIdA = a.collection?.id ?? sortLast;
  const collectionIdB = b.collection?.id ?? sortLast;

  if (collectionIdA < collectionIdB) return -1;
  if (collectionIdA > collectionIdB) return 1;

  // If the two collection ids are the same, sort on the names of the models
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;

  // If the two models have the same name, sort on id
  const idA = a.id ?? sortLast;
  const idB = b.id ?? sortLast;

  if (idA < idB) return -1;
  if (idA > idB) return 1;

  return 0;
};

const ModelGroupHeader = (props: VirtualizedGridItemProps<HeaderGridItem>) => {
  const { groupLabel, style } = props;
  return <div style={style}>{groupLabel}</div>;
};

interface HeaderGridItem {
  collection: Collection | null | undefined;
}
type GridItem = Model | HeaderGridItem;

const addCellsForGroupHeaders = (models: Model[]): GridItem[] => {
  const modelsWithHeaders: (Model | HeaderGridItem)[] = [];
  for (let i = 0; i < models.length; i++) {
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
      modelsWithHeaders.push(groupHeader);
    }
    modelsWithHeaders.push(model);
  }
  return modelsWithHeaders;
};

const gridItemIsGroupHeader = (item: GridItem): item is HeaderGridItem =>
  (item as Model).model === undefined;
