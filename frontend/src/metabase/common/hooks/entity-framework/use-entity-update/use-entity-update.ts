import type { Action } from "@reduxjs/toolkit";
import { useAsyncFn } from "react-use";

import { useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type { State } from "metabase-types/store";

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

export interface UseEntityUpdateResult<
  TId,
  TEntity,
  TEntityInfo extends EntityInfo<TId>,
  TEntityData,
> {
  data: TEntity | undefined;
  isLoading: boolean;
  error: unknown;
  mutate: (
    entityInfo: TEntityInfo,
    updates: Partial<TEntityData>,
  ) => Promise<TEntity>;
}

/**
 * @deprecated use "metabase/api" instead
 */
export const useEntityUpdate = <
  TId,
  TEntity,
  TEntityInfo extends EntityInfo<TId>,
  TEntityData,
>({
  update,
  getObject,
}: UseEntityUpdateProps<
  TId,
  TEntity,
  TEntityInfo,
  TEntityData
>): UseEntityUpdateResult<TId, TEntity, TEntityInfo, TEntityData> => {
  const store = useStore();

  const [{ value: data, loading: isLoading, error }, handleUpdate] = useAsyncFn(
    async (entityInfo: TEntityInfo, updates: Partial<TEntityData>) => {
      await store.dispatch(update(entityInfo, updates));
      const entity = getObject(store.getState(), { entityId: entityInfo.id });
      return checkNotNull(entity);
    },
    [store, update, getObject],
  );

  return { data, isLoading, error, mutate: handleUpdate };
};
