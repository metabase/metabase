/* @flow */
import React from "react";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

type Props = {
  collectionId: number,
  children: () => void,
};

const CollectionItemsLoader = ({ collectionId, children, ...props }: Props) => (
  <Collection.Loader
    {...props}
    id={collectionId}
    children={({ object }) => (
      <Search.ListLoader
        {...props}
        query={{ collection: collectionId }}
        wrapped
        children={({ list }) =>
          object &&
          list &&
          children({
            collection: object,
            items: list,
          })
        }
      />
    )}
  />
);

export default CollectionItemsLoader;
