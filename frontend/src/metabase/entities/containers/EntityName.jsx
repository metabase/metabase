/* eslint-disable react/prop-types */
import React from "react";

import EntityObjectLoader from "./EntityObjectLoader";

const EntityName = ({ entityType, entityId, property = "name" }) => (
  <EntityObjectLoader
    entityType={entityType}
    entityId={entityId}
    properties={[property]}
    loadingAndErrorWrapper={false}
    wrapped
  >
    {({ object }) => (object ? <span>{object.getName()}</span> : null)}
  </EntityObjectLoader>
);

export default EntityName;
