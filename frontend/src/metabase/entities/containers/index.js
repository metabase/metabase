/* eslint-disable react/prop-types */
import EntityLink from "./EntityLink";
import EntityListLoader, { entityListLoader } from "./EntityListLoader";
import { EntityName } from "./EntityName";
import EntityObjectLoader, { entityObjectLoader } from "./EntityObjectLoader";

export function addEntityContainers(entity) {
  const ObjectName = entity.nameOne;

  // Entity.load higher-order component
  entity.load = ({ id, query, ...props } = {}) =>
    entityObjectLoader({
      entityType: entity.name,
      entityId: id,
      entityQuery: query,
      ...props,
    });

  // Entity.Loader component
  entity.Loader = ({ id, ...props }) => (
    <EntityObjectLoader entityType={entity.name} entityId={id} {...props} />
  );
  entity.Loader.displayName = `${ObjectName}.Loader`;

  // Entity.loadList higher-order component
  entity.loadList = ({ query, ...props } = {}) =>
    entityListLoader({ entityType: entity.name, entityQuery: query, ...props });

  // Entity.ListLoader component
  entity.ListLoader = ({ query, ...props }) => (
    <EntityListLoader entityType={entity.name} entityQuery={query} {...props} />
  );
  entity.ListLoader.displayName = `${ObjectName}.ListLoader`;

  // Entity.Name component
  entity.Name = ({ id, ...props }) => (
    <EntityName entityType={entity.name} entityId={id} {...props} />
  );
  entity.Name.displayName = `${ObjectName}.Name`;

  // Entity.Link component
  entity.Link = ({ id, ...props }) => (
    <EntityLink entityType={entity.name} entityId={id} {...props} />
  );
  entity.Link.displayName = `${ObjectName}.Link`;
}
