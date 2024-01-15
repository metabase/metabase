/* Questions for Kyle
 * - Do you have any suggestions about how the grid of models should adapt to a narrow viewport? Maybe a CSS-grid type solution would work here?
 *
 * Questions for backend team
 * - The max number of results shown in /api/search is 1000 (I believe, due to https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/search/config.clj#L30-L32 and https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/api/search.clj#L471). To definitely retrieve all the models, would it make sense to poll continually, increasing the offset by 1000, until a page with fewer than 1000 results is returned?
 * */

import { useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import type { CollectionItem } from "metabase-types/api";
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
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import {
  DatabaseCard,
  DatabaseGridItem,
  EllipsifiedWithWrapping,
  LastEditedInfoSeparator,
  ModelCard,
  ModelGroupGrid,
} from "./BrowseData.styled";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

type Model = CollectionItem;

const groupModelsByParentCollection = (ungroupedModelsArray: Model[]) => {
  // We build up a mapping of collection ids to names as we iterate through the models
  const collectionIdToName: Record<string, string> = {};
  const groupedModels: Record<string, Model[]> = {};
  for (const model of ungroupedModelsArray) {
    const collectionId = `${model.collection?.id || -1}`;
    const collectionName = model.collection?.name || "No collection"; // TODO: Typescript requires a default value; find a good one
    collectionIdToName[collectionId] = collectionName;
    groupedModels[collectionId] ??= [];
    groupedModels[collectionId].push(model);
  }
  return { groupedModels, collectionIdToName };
};

const ModelsTab = ({ models }: { models: Model[] }) => {
  if (!models.length) {
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
          title={t`No models here yet`}
          message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
          icon="empty"
        />
      </div>
    );
  }
  const { groupedModels, collectionIdToName } =
    groupModelsByParentCollection(models);
  const entries = Object.entries(groupedModels);
  return (
    <>
      {entries.map(([collectionId, models], index) => {
        return (
          <ModelGroup
            key={collectionId}
            collectionName={collectionIdToName[collectionId]}
            models={models}
            includeDivider={index !== 0}
          />
        );
      })}
    </>
  );
};

const DatabasesTab = ({ databases }: { databases: IDatabase[] }) => {
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

export const BrowseDataTabWrapper = ({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  children: JSX.Element;
}) => {
  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }
  if (error) {
    return <LoadingAndErrorWrapper error />;
  }
  return children;
};

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
    metadata: _metadataForDatabases,
    error: errorLoadingDatabases,
    isLoading: isDatabaseListLoading,
  } = useDatabaseListQuery({
    reload: true,
  });

  const tabs: Record<string, BrowseDataTab> = {
    models: {
      label: t`Models`,
      component: (
        <BrowseDataTabWrapper
          isLoading={isModelListLoading}
          error={errorLoadingModels}
        >
          <ModelsTab models={models} />
        </BrowseDataTabWrapper>
      ),
    },
    databases: {
      label: t`Databases`,
      component: (
        <BrowseDataTabWrapper
          isLoading={isDatabaseListLoading}
          error={errorLoadingDatabases}
        >
          <DatabasesTab databases={databases} />
        </BrowseDataTabWrapper>
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

const ModelGroup = ({
  collectionName,
  models,
  includeDivider = true,
}: {
  collectionName: string;
  models: Model[];
  includeDivider?: boolean;
}) => {
  return (
    <>
      {includeDivider && <Divider />}
      <div
        style={{
          padding: "1rem 0",
          flexFlow: "column nowrap",
          width: "100%",
          display: "flex",
        }}
      >
        <h4 style={{ width: "100%" }}>{collectionName}</h4>
        <ModelGroupGrid>
          {/* TODO: Type the `model` var*/}
          {models.map((model: any) => {
            // If there is no information about the last edit,
            // use the timestamp of the creation
            const lastEditInfo = {
              full_name:
                model.last_editor_common_name ?? model.creator_common_name,
              timestamp: model.last_edited_at ?? model.created_at,
            };
            const item: CollectionItemWithLastEditedInfo = {
              ...model,
              "last-edit-info": lastEditInfo,
            };
            return (
              <div key={model.id}>
                <Link
                  to={Urls.modelDetail(model)}
                  // Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
                  data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
                >
                  <ModelCard>
                    <h4 className="text-wrap" style={{ lineHeight: "16px" }}>
                      {model.name}
                    </h4>
                    <Text size="xs" style={{ height: "32px" }}>
                      <EllipsifiedWithWrapping
                        tooltipMaxWidth="100%"
                        className={model.description ? "" : "text-light"}
                      >
                        {model.description || "No description."}{" "}
                      </EllipsifiedWithWrapping>
                    </Text>
                    <LastEditInfoLabel
                      prefix={null}
                      item={item}
                      fullName={lastEditInfo.full_name}
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
          })}
        </ModelGroupGrid>
      </div>
    </>
  );
};
