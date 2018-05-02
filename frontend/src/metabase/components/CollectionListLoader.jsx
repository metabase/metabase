/* @flow */
import React from "react";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";

type Props = {
  children: () => void,
};

const CollectionListLoader = (props: Props) => (
  <EntityListLoader entityType="collections" {...props} />
);

export default CollectionListLoader;
