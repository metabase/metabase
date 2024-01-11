/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { Component } from "react";

import Database from "metabase/entities/databases";
import Model from "metabase/entities/models";
import type { default as IDatabase } from "metabase-lib/metadata/Database";
import { Divider, Flex, Tabs } from "metabase/ui";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { Grid } from "metabase/components/Grid";
import { Icon } from "metabase/ui";
import Link from "metabase/core/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import { DatabaseCard, DatabaseGridItem } from "./BrowseData.styled";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

const DatabaseBrowser = ({ databases }: { databases: IDatabase[] }) => (
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

const ModelBrowser = ({ models }: { models: IModel[] }) => (
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

function BrowseData({ databases }: { databases: IDatabase[] }) {
  const models = [];
  // Not sure what Tabs' prop value does
  const tabs: BrowseDataTab[] = [
    { label: "Models", component: <div>Models</div> },
    { label: "Databases", component: <DatabaseBrowser databases={databases} /> },
  ];
  return (
    <div data-testid="database-browser">
      <BrowseHeader crumbs={[{ title: t`Our data!` }]} />
      <Tabs value={"test"} onTabChange={() => {}}>
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
}

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
