/* @flow */
import React from "react";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";

type Props = {
  writable: boolean, // inherited from old CollectionList component
  children: () => void,
};

const CollectionListLoader = ({ children, writable, ...props }: Props) => (
  <EntityListLoader
    entityType="collections"
    {...props}
    children={({ list, collections, ...props }) =>
      children({
        list: writable ? list && list.filter(c => c.can_write) : list,
        collections: writable
          ? collections && collections.filter(c => c.can_write)
          : collections,
        ...props,
      })
    }
  />
);

export default CollectionListLoader;
