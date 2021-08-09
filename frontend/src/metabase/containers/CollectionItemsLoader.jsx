import React from "react";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

const PINNED_DASHBOARDS_LOAD_LIMIT = 500;

type Props = {
  collectionId: number,
  children: () => void,
};

const CollectionItemsLoader = ({ collectionId, children, ...props }: Props) => (
  <Collection.Loader {...props} id={collectionId}>
    {({ object }) => (
      <Search.ListLoader
        {...props}
        query={{
          collection: collectionId,
          pinned_state: "is_pinned",
          sort_column: "name",
          sort_direction: "asc",
          models: "dashboard",
          limit: PINNED_DASHBOARDS_LOAD_LIMIT,
        }}
        wrapped
      >
        {({ list }) =>
          object &&
          list &&
          children({
            collection: object,
            items: list,
          })
        }
      </Search.ListLoader>
    )}
  </Collection.Loader>
);

export default CollectionItemsLoader;
