import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import type { TagType } from "metabase/api/tags";

import type {
  BaseEntity,
  EntityDefinition,
  EntityType,
  FetchType,
} from "./types";
import type { UseQuery } from "./types/rtk";

interface Props<Entity> {
  entityType: EntityType;
  fetchType?: FetchType;
  options?: Parameters<
    UseQuery<QueryDefinition<unknown, BaseQueryFn, TagType, Entity>>
  >[1];
  query: unknown;
}

export const useGetEntityQuery = <Entity extends BaseEntity, EntityWrapper>({
  entityType,
  fetchType = "fetch",
  options,
  query,
}: Props<Entity>) => {
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
  } = entityDefinition.rtk.getUseGetQuery(fetchType);

  return useGetQuery(query, options);
};
