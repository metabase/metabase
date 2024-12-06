/* eslint-disable react/prop-types */
import EntityLink from "./EntityLink";
import EntityListLoader, { entityListLoader } from "./EntityListLoader";
import { EntityName } from "./EntityName";
import {
  EntityObjectLoaderRtkQuery,
  entityObjectLoaderRtkQuery,
} from "./rtk-query";

export function addEntityContainers(entity) {
  const ObjectName = entity.nameOne;

  /**
   * @deprecated HOCs are deprecated
   */
  entity.load = ({ id, query, ...props } = {}) =>
    entityObjectLoaderRtkQuery({
      entityType: entity.name,
      entityId: id,
      entityQuery: query,
      ...props,
    });

  entity.Loader = ({ id, ...props }) => (
    <EntityObjectLoaderRtkQuery
      entityType={entity.name}
      entityId={id}
      {...props}
    />
  );
  entity.Loader.displayName = `${ObjectName}.Loader`;

  /**
   * @deprecated HOCs are deprecated
   */
  entity.loadList = ({ query, ...props } = {}) =>
    entityListLoader({ entityType: entity.name, entityQuery: query, ...props });

  entity.ListLoader = ({ query, ...props }) => (
    <EntityListLoader entityType={entity.name} entityQuery={query} {...props} />
  );
  entity.ListLoader.displayName = `${ObjectName}.ListLoader`;

  entity.Name = ({ id, ...props }) => (
    <EntityName entityType={entity.name} entityId={id} {...props} />
  );
  entity.Name.displayName = `${ObjectName}.Name`;

  entity.Link = ({ id, ...props }) => (
    <EntityLink entityType={entity.name} entityId={id} {...props} />
  );
  entity.Link.displayName = `${ObjectName}.Link`;
}
