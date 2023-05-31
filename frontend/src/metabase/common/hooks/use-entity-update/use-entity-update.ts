import { useCallback } from "react";
import type { Action } from "@reduxjs/toolkit";
import { useDispatch, useStore } from "metabase/lib/redux";
import { State } from "metabase-types/store";

export interface HasId<TId> {
  id: TId;
}

export interface EntityQueryOptions<TId> {
  entityId?: TId;
}

export interface UseEntityUpdateProps<
  TId,
  TEntity,
  TEntityInfo extends HasId<TId>,
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
  TEntityInfo extends HasId<TId>,
  TEntityData,
>({
  update,
  getObject,
}: UseEntityUpdateProps<TId, TEntity, TEntityInfo, TEntityData>) => {
  const store = useStore();
  const dispatch = useDispatch();

  return useCallback(
    async (entityInfo: TEntityInfo, updates: TEntityData) => {
      await dispatch(update(entityInfo, updates));
      return getObject(store.getState(), { entityId: entityInfo.id });
    },
    [store, dispatch, update, getObject],
  );
};
