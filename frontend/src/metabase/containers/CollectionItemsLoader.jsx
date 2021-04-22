import React from "react";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

type Props = {
  collectionId: number,
  children: () => void,
};

const CollectionItemsLoader = ({ collectionId, children, ...props }: Props) => (
  <Collection.Loader {...props} id={collectionId}>
    {({ object }) => (
      <Search.ListLoader
        {...props}
        query={{ collection: collectionId }}
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
