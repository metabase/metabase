import _ from "underscore";

import { entityIdApi } from "metabase/api";
import type { TranslateEntityIdResponse } from "metabase/api/entity-id";
import { isBaseEntityID } from "metabase-types/api/entity-id";
import type { Dispatch } from "metabase-types/store";

import type {
  SUPPORTED_ENTITIES,
  ValidatedEntityIdProps,
  ValidatedEntityIdReturned,
} from "./types";

export const fetchEntityId =
  <
    TEntity extends keyof SUPPORTED_ENTITIES = keyof SUPPORTED_ENTITIES,
    TReturnedId = SUPPORTED_ENTITIES[TEntity],
  >({
    type,
    id,
  }: ValidatedEntityIdProps<TEntity>) =>
  async (
    dispatch: Dispatch,
  ): Promise<ValidatedEntityIdReturned<TEntity, TReturnedId>> => {
    if (_.isNumber(id)) {
      return { id: id as TReturnedId, isError: false };
    }

    if (id === "new") {
      return { id: null, isError: false };
    }

    if (!isBaseEntityID(id)) {
      return { id: null, isError: true };
    }

    const { data, isError } = await (dispatch(
      entityIdApi.endpoints.translateEntityId.initiate({
        [type]: [id],
      }),
    ) as Promise<{
      data?: TranslateEntityIdResponse;
      isError?: any;
      unwrap: () => TranslateEntityIdResponse;
    }>);

    const entityId = data?.[id];
    if (isError || !entityId || entityId.status === "not-found") {
      return { id: null, isError: true };
    }

    return { id: data[id]?.id as TReturnedId, isError: false };
  };
