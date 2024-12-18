/* eslint-disable react/prop-types */
import EntityListLoader, { entityListLoader } from "./EntityListLoader";
import { EntityName } from "./EntityName";
import { entityListLoaderRtkQuery, entityObjectLoader } from "./rtk-query";

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
    // TODO: remove this in https://github.com/metabase/metabase/issues/50324
    if (!entity.rtk?.useListQuery) {
      return entity.loadListLegacy({ query, ...props });
    }

    return entityListLoaderRtkQuery({
      entityType: entity.name,
      entityQuery: query,
      ...props,
    });
  };

  /**
   * TODO: remove this is in https://github.com/metabase/metabase/issues/50325
   *
   * @deprecated HOCs are deprecated
   */
  entity.loadListLegacy = ({ query, ...props } = {}) => {
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
