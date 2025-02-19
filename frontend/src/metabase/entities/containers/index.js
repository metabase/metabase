/* eslint-disable react/prop-types */
import { EntityName } from "./EntityName";
import {
  EntityListLoader,
  entityListLoader,
  entityObjectLoader,
} from "./rtk-query";

export function addEntityContainers(entity) {
  const ObjectName = entity.nameOne;

  /**
   * @deprecated HOCs are deprecated
   */
  entity.load = ({ id, query, ...props } = {}) =>
    entityObjectLoader({
      entityType: entity.name,
      entityId: id,
      entityQuery: query,
      ...props,
    });

  /**
   * @deprecated HOCs are deprecated
   */
  entity.loadList = ({ query, ...props } = {}) => {
    return entityListLoader({
      entityType: entity.name,
      entityQuery: query,
      ...props,
    });
  };

  entity.ListLoader = ({ query, ...props }) => (
    <EntityListLoader entityType={entity.name} entityQuery={query} {...props} />
  );
  entity.ListLoader.displayName = `${ObjectName}.ListLoader`;

  entity.Name = ({ id, ...props }) => (
    <EntityName entityType={entity.name} entityId={id} {...props} />
  );
  entity.Name.displayName = `${ObjectName}.Name`;
}
