import { useCallback } from "react";
import type { Action } from "@reduxjs/toolkit";
import { useDispatch, useStore } from "metabase/lib/redux";
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
  const dispatch = useDispatch();

  return useCallback(
    async (entityInfo: TEntityInfo, updates: Partial<TEntityData>) => {
      await dispatch(update(entityInfo, updates));
      const entity = getObject(store.getState(), { entityId: entityInfo.id });
      return checkNotNull(entity);
    },
    [store, dispatch, update, getObject],
  );
};
