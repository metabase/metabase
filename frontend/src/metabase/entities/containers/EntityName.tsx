import { useMemo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";

import type { EntityDefinition, EntityId, EntityType } from "./rtk-query";

interface Props {
  entityId: EntityId;
  entityType: EntityType;
}

/**
 * @deprecated use "metabase/api" instead
 */
export const EntityName = <Entity, EntityWrapper>({
  entityType,
  entityId,
}: Props) => {
  const tc = useTranslateContent();

  const entityDefinition: EntityDefinition<Entity, EntityWrapper> =
    useMemo(() => {
      // dynamic require due to circular dependencies
       
      const entitiesDefinitions = require("metabase/entities");
      return entitiesDefinitions[entityType];
    }, [entityType]);

  const {
    /**
     * Hack: this hook appears to be acquired conditionally, which in
     * normal circumstances would violate the rules of React hooks.
     * As long as getUseGetQuery is a pure function we have a guarantee that
     * the same hook will be used and rules of hooks are not violated.
     */
    useGetQuery,
  } = entityDefinition.rtk.getUseGetQuery("fetch");

  const { data: entity } = useGetQuery({ id: entityId });

  if (!entity) {
    return null;
  }

  return <span>{tc(entityDefinition.objectSelectors.getName(entity))}</span>;
};
