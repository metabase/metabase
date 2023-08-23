/* eslint-disable react/prop-types */
import EntityObjectLoader from "./EntityObjectLoader";

export const EntityName = ({ entityType, entityId, property = "name" }) => (
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
