// ******************************************************************************************************
// TODO: Implement quickly the grouping of models by collection and share the branch with Kyle along with my questions
// ******************************************************************************************************

/* Questions for Kyle
 * - Do you have any suggestions about how the grid of models should adapt to a narrow viewport? Maybe a CSS-grid type solution would work here?
 *
 * Questions for backend team
 * - The max number of results shown in /api/search is 1000 (I believe, due to https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/search/config.clj#L30-L32 and https://github.com/metabase/metabase/blob/672b07e900b8291fe205bb0e929e7730f32416a2/src/metabase/api/search.clj#L471). To definitely retrieve all the models, would it make sense to poll continually, increasing the offset by 1000, until a page with fewer than 1000 results is returned?
 * */

import { useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import type { Card, CollectionItem, User } from "metabase-types/api";
import { Divider, Flex, Tabs, Icon, Text } from "metabase/ui";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { Grid } from "metabase/components/Grid";

import Link from "metabase/core/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import {
  DatabaseCard,
  DatabaseGridItem,
  LastEditedInfoSeparator,
  ModelCard,
  ModelGridItem,
} from "./BrowseData.styled";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import type { CollectionItemWithLastEditedInfo } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import EmptyState from "metabase/components/EmptyState";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

// TODO:Use the Ellipsified component to ellipsify the model description. Note the parent component must

const groupModelsByParentCollection = (
  ungroupedModelsArray: CollectionItem[],
) => {
  return _.groupBy(
    ungroupedModelsArray,
    model => model.collection?.id || "Ungrouped",
  );
};

const ModelsTab = ({ models }: { models: CollectionItem[] }) => {
  if (!models.length)
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
  const collectionIdToModels = Object.entries(
    groupModelsByParentCollection(models),
  );
  return (
      {collectionIdToModels.map(([collectionId, models]) => {
        return (
          <CollectionOfModels
            collectionId={collectionId}
            collectionName={collectionId}
            models={models}
          />
        );
      })}
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

export const BrowseDataPage = () => {
  const defaultTabId = "models";
  const [currentTabId, setTabId] = useState<string | null>(defaultTabId);

  const {
    data: models = [],
    metadata: _metadataForModels,
    isLoading: _isModelListLoading,
  } = useSearchListQuery({
    query: {
      models: ["dataset"],
    },
    reload: true,
  });

  const {
    data: databases = [],
    metadata: _metadataForDatabases,
    isLoading: _isDatabaseListLoading,
  } = useDatabaseListQuery({
    reload: true,
  });

  const tabs: Record<string, BrowseDataTab> = {
    models: { label: t`Models`, component: <ModelsTab models={models} /> },
    databases: {
      label: t`Databases`,
      component: <DatabasesTab databases={databases} />,
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
      <BrowseHeader crumbs={[{ title: t`Browse data` }]} />
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

const CollectionOfModels = ({
  collectionId,
  collectionName,
  models,
}: {
  collectionId: string;
  collectionName: string;
  models: CollectionItem[];
}) => {
  return (
    <div key={`collection-${collectionId}`} style={{display: 'flex', }}>
      <h3>{collectionName}</h3>
      <Grid>
        {models.map(model => {
          console.log("model", model);
          // If there is no information about the last edit,
          // use the timestamp of the creation
          const lastEditInfo = {
            full_name:
              model.last_editor_common_name! ?? model.creator_common_name!,
            timestamp: model.last_edited_at! ?? model.created_at!,
          };
          const item: CollectionItemWithLastEditedInfo = {
            ...model,
            "last-edit-info": lastEditInfo,
          };
          return (
            <ModelGridItem key={model.id}>
              <Link
                to={Urls.modelDetail(model)}
                // Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
                data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
              >
                <ModelCard>
                  <h4 className="text-wrap">{model.name}</h4>
                  <Text
                    size="xs"
                    style={{
                      height: "32px",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      width: "100%",
                      whiteSpace: "normal",
                      display: "block",
                    }}
                  >
                    {model.description}{" "}
                  </Text>
                  <LastEditInfoLabel
                    prefix={null}
                    item={item}
                    fullName={lastEditInfo.full_name}
                    // TODO: This feels a little complicated.
                    // Let me see if I can simplify it
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
            </ModelGridItem>
          );
        })}
      </Grid>
    </div>
  );
};
