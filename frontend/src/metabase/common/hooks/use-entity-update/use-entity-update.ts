import { useCallback } from "react";
import type { Action } from "@reduxjs/toolkit";
import { useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/core/utils/types";
import { State } from "metabase-types/store";

export interface EntityInfo<TId> {
  id: TId;
}

export interface EntityQueryOptions<TId> {
  entityId?: TId;
}

export interface UseEntityUpdateProps<
  TId,
  TEntity,
  TEntityInfo extends EntityInfo<TId>,
  TEntityData,
> {
  update: (entityInfo: TEntityInfo, updates: Partial<TEntityData>) => Action;
  getObject: (
    state: State,
    options: EntityQueryOptions<TId>,
  ) => TEntity | undefined;
}

export const useEntityUpdate = <
  TId,
  TEntity,
  TEntityInfo extends EntityInfo<TId>,
  TEntityData,
>({
  update,
  getObject,
}: UseEntityUpdateProps<TId, TEntity, TEntityInfo, TEntityData>) => {
  const store = useStore();

  return useCallback(
    async (entityInfo: TEntityInfo, updates: Partial<TEntityData>) => {
      await store.dispatch(update(entityInfo, updates));
      const entity = getObject(store.getState(), { entityId: entityInfo.id });
      return checkNotNull(entity);
    },
    [store, update, getObject],
  );
};
