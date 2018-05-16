/* @flow */
import React from "react";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";

type Props = {
  children: () => void,
};

const CollectionListLoader = ({ children, ...props }: Props) => (
  <EntityListLoader
    entityType="collections"
    children={({ list, ...rest }) => children({ collections: list, ...rest })}
    {...props}
  />
);

export default CollectionListLoader;
