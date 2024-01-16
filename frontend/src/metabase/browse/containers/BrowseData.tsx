/* Questions for Kyle
 * - Do you have any suggestions about how the grid of models should adapt to a narrow viewport? Maybe a CSS-grid type solution would work here?
 *
 * Questions for backend team
 * - The max number of results shown in /api/search is 1000 (I believe, due to https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/search/config.clj#L30-L32 and https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/api/search.clj#L471). To definitely retrieve all the models, would it make sense to poll continually, increasing the offset by 1000, until a page with fewer than 1000 results is returned?
 * */

import { useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import type { CollectionItem } from "metabase-types/api";
import { Divider, Flex, Tabs, Icon, Text } from "metabase/ui";

// TODO: Sort models alphabetically

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
import { VirtualizedGrid } from "@mierak/react-virtualized-grid";
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

  const modelsWithEditInfo: Model[] = useMemo(() => {
    // For testing, increase the number of models
    if (models.length) {
      for (let i = 0; i < 999; i++) {
        const pushMe = models[i];
        models.push(pushMe);
      }
    }

    console.log("useMemo function invoked");
    // Sort models by collection name and then secondarily by id. We sort on id first
    const modelsSortedByCollectionId = _.sortBy(
      models,
      models => models.collection?.id || "zzz",
    );
    const modelsSortedByCollectionNameAndId = _.sortBy(
      modelsSortedByCollectionId,
      model => model.collection?.name || "zzz",
    );
    const modelsWithEditInfo: Model[] = modelsSortedByCollectionNameAndId.map(
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

    return modelsWithEditInfo;
  }, [models]);

  console.log("modelsWithEditInfo.length", modelsWithEditInfo.length);

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
          models={modelsWithEditInfo}
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

const VirtualizedModelGrid = styled(VirtualizedGrid)`
  &.container {
    //--grid-gap: 16px;
    //--grid-height: 100vh;
    //--grid-columns: '2';
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    grid-gap: 16px;
    overflow-y: auto;
    width: 100%;
    max-height: 100vh;
    height: var(--grid-height);
  }

  & .cell {
    --cell-height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;
    height: var(--cell-height);
  }
`


const ModelsTab = ({
  models,
  error,
  isLoading,
}: {
  models: Model[];
  isLoading: boolean;
  error: unknown;
}) => {
  if (error) {
    return <LoadingAndErrorWrapper error />;
  }
  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }
  return models.length ? (
    <VirtualizedModelGrid
      itemCount={models.length}
      gridGap={16}
      rowHeight={160}
      cellWidth={240}
      // items={models}
      // itemHeight={160}
      // itemMinWidth={240}
      // // TODO: Change the width
      // renderItem={(props: VirtualizedGridItemProps<Model>) => (
      //   <ModelItem {...props} />
      // )}
      // gridGapSize={16}
      // scrollElement={document.getElementsByTagName('main')[0]}
    >
      {(index: number, rowIndex: number, columnIndex: number) => (
        <ModelItem model={models[index]} />
      )}
    </VirtualizedModelGrid>
  ) : (
    <ContentOfEmptyTab
      title={t`No models here yet`}
      message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
    />
  );
};

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

const ModelItem = ({ model }: { model: Model }) => {
  // const { rowIndex, columnIndex, columnCount, items: models, style } = props;
  // const index = rowIndex * columnCount + columnIndex;
  // if (index >= models.length) return null;
  // const model = models[index];

  // TODO: temporary workaround
  if (!model) {
    console.log("model is undefined");
    return null;
  }
  return (
    <div key={model.id}>
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

// const sortModelsByParentCollection = (unsortedModels: Model[]) => {
//   // We build up a mapping of collection ids to names as we iterate through the models
//   const collectionIdToName: Record<string, string> = {};
//   const sortedModels: Record<string, Model[]> = {};
//   for (const model of unsortedModels) {
//     const collectionId = `${model.collection?.id || -1}`;
//     const collectionName = model.collection?.name || "No collection"; // TODO: Typescript requires a default value; find a good one
//     collectionIdToName[collectionId] = collectionName;
//     groupedModels[collectionId] ??= [];
//     groupedModels[collectionId].push(model);
//   }
//   return { groupedModels, collectionIdToName };
// };

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
