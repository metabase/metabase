import React from "react";

import EntityObjectLoader from "./EntityObjectLoader";

const EntityName = ({ entityType, entityId, name = "name" }) => (
  <EntityObjectLoader
    entityType={entityType}
    entityId={entityId}
    properties={[name]}
    loadingAndErrorWrapper={false}
    wrapped
  >
    {({ object }) => (object ? <span>{object.getName()}</span> : null)}
  </EntityObjectLoader>
);

export default EntityName;
