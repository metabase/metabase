import { useMemo } from "react";

import type { BaseEntity, EntityDefinition, EntityType } from "./rtk-query";

type EntityId = string | number;

interface Props {
  entityType: EntityType;
  entityId: EntityId;
}

export const EntityName = <Entity extends BaseEntity, EntityWrapper>({
  entityType,
  entityId,
}: Props) => {
  const entityDefinition: EntityDefinition<Entity, EntityWrapper> =
    useMemo(() => {
      // dynamic require due to circular dependencies
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const entitiesDefinitions = require("metabase/entities");
      return entitiesDefinitions[entityType];
    }, [entityType]);

  const {
    /**
     * Hack: this hook appears to be acquired conditionally, which in
     * normal circumstances would violate the rules of React hooks.
     * As long as fetchType never changes during component's lifecycle
     * and getUseGetQuery is a pure function, we have a guarantee that
     * the same hook will be used and rules of hooks are not violated.
     */
    useGetQuery,
  } = entityDefinition.rtk.getUseGetQuery("fetch");

  const { data: entity } = useGetQuery({ id: entityId });

  if (!entity) {
    return null;
  }

  return <span>{entity.display_name ?? entity.name}</span>;
};
