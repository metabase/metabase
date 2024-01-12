import { useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import type { Card, Collection, SearchResult, User } from "metabase-types/api";
import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import { Divider, Flex, Tabs } from "metabase/ui";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { Grid } from "metabase/components/Grid";
import { Icon } from "metabase/ui";
import Link from "metabase/core/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import {
  DatabaseCard,
  DatabaseGridItem,
  ModelCard,
  ModelGridItem,
} from "./BrowseData.styled";
import type { WrappedEntity } from "metabase-types/entities";
import Users from "metabase/entities/users";
import Collections from "metabase/entities/collections/collections";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}


const ModelsTab = ({
  models,
  collections,
  users,
}: {
  models: Card[];
  collections: Collection[];
  users?: User[];
}) => {

  console.log('models', models);
  return (
    <Grid>
      {models.map((model: Card) => {
        {/* console.log("model.creator", model.creator); */}
        {/* const matchingUsers = users?.filter( */}
        {/*   ({ id }) => id === model.creator?.id, */}
        {/* ); */}
        {/* console.log("matchingUsers", matchingUsers); */}
        {/* const user = matchingUsers?.length ? matchingUsers[0] : null; */}
        return (
          <ModelGridItem key={model.id}>
            <Link
              to={Urls.modelDetail(model)}
              // Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
              data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
            >
              <ModelCard>
                <h3 className="text-wrap">{model.name}</h3>
                {model.description && (
                  <p className="text-wrap">{model.description} </p>
                )}
                {user && user.first_name}
              </ModelCard>
            </Link>
          </ModelGridItem>
        );
      })}
    </Grid>
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

const BrowseDataPage = ({
  models,
  users,
  databases,
}: {
  models: Card[];
  users: User[];
  databases: IDatabase[];
}) => {
  const defaultTab = "Models";
  const [currentTab, setTab] = useState<string | null>(defaultTab);

  // const createExampleModel = (id: number): CollectionItem => ({
  //   name: `Example model ${id}`,
  //   id,
  //   model: "dataset",
  //   description: "This is an example model",
  //   getIcon: () => ({ name: "model" }),
  //   getUrl: () => "to be determined",
  // });
  // const exampleModels = Array.from(Array(20).keys()).map(createExampleModel);
  console.log("users", users);

  const tabs: BrowseDataTab[] = [
    { label: "Models", component: <ModelsTab models={models} users={users} /> },
    { label: "Databases", component: <DatabasesTab databases={databases} /> },
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

export const ConnectedBrowseDataPage = _.compose(
  Databases.loadList(),
  Users.loadList(),
  //Collections.loadList({
  //  query: {
  //    tree: true,
  //    //"exclude-other-user-collections": true,
  //    "exclude-archived": true,
  //  },
  //  loadingAndErrorWrapper: false,
  //}),
  Search.loadList({
    query: () => ({
      models: ["dataset"],
    }),
    listName: "models",
  }),
)(BrowseDataPage);
