// ******************************************************************************************************
// TODO: Implement quickly the grouping of models by collection and share the branch with Kyle along with my questions
// ******************************************************************************************************

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

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

// TODO:Use the Ellipsified component to ellipsify the model description. Note the parent component must

const ModelsTab = ({ models }: { models: CollectionItem[] }) => {
  return (
    <Grid>
      {models.map((model: CollectionItem) => {
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
  );
};

// TODO: Ping Kyle about how the grid should be made responsive (with flexbox or grid or what?)

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
  const defaultTab = "Models";
  const [currentTab, setTab] = useState<string | null>(defaultTab);

  // TODO: Ask the backend team, at what point does the search end point automatically paginate?
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

  const tabs: BrowseDataTab[] = [
    { label: t`Models`, component: <ModelsTab models={models} /> },
    { label: t`Databases`, component: <DatabasesTab databases={databases} /> },
  ];
  // TODO: Fix font of BrowseHeader
  // TODO: Do we still need 'Learn about our data?'
  return (
    <div data-testid="database-browser">
      <BrowseHeader crumbs={[{ title: t`Browse data` }]} />
      <Tabs value={currentTab} onTabChange={setTab}>
        <Flex>
          <Tabs.List>
            {tabs.map((tab: BrowseDataTab) => (
              <Tabs.Tab key={tab.label} value={tab.label}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Flex>
        <Divider />
        {tabs.map(tab => (
          <Tabs.Panel key={tab.label} value={tab.label}>
            {tab.component}
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
};

// NOTE: The minimum mergeable version does not need to include the verified badges
// NOTE: There's an EmptyState component

// I think I need to do something like the following.
// To get the models, I need to get the collections, and then get the items in each collection.
// If these items are marked 'dataset', they're models.
/* Something like this gets the list of collections, and then the particular items within a collection

export default _.compose(
  Bookmark.loadList(),
  Databases.loadList(),
  // Get the list of collections, I think
  Collection.loadList({
    query: {
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    },
    loadingAndErrorWrapper: false,
  }),
  // Get the particular items within a collection
  Collection.load({
    id: (_, props) => props.collectionId,
    reload: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionContent);


This kind of code distinguishes models from other kinds of items that can be in collections:
https://github.com/metabase/metabase/blob/be73bb2650729c2bae09b5b648443e2232687faf/frontend/src/metabase/collections/components/PinnedItemCard/PinnedItemCard.tsx#L41

It's a bit odd that I can't get just the models but have to get everything else,
but perhaps there's a way to filter the results to just the models.

The items retrieved in a collection are probably CollectionItems, defined here:
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

If item.model === 'dataset', it's a model, or so I think.

See here too:
https://github.com/metabase/metabase/blob/be73bb2650729c2bae09b5b648443e2232687faf/frontend/src/metabase-types/api/collection.ts#L72

 */
