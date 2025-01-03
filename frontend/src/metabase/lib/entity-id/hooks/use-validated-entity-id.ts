import { useMemo } from "react";

import { skipToken } from "metabase/api";
import { useTranslateEntityIdQuery } from "metabase/api/entity-id";
import type { BaseEntityId, CardId, DashboardId } from "metabase-types/api";
import { isBaseEntityID } from "metabase-types/api/entity-id";

type SUPPORTED_ENTITIES = { dashboard: DashboardId; card: CardId };

/**
 * A hook that validates and potentially translates an entity ID.
 *
 * If the hook is loading, then `null` is returned.
 * If the ID is a valid NanoID and the translation is successful, the translated ID is returned.
 * Otherwise, the original ID is returned.
 *
 * @param {Object} params - The parameters for the hook.
 * @param {EntityType} params.type - The type of the entity (e.g., 'card', 'dashboard', etc.).
 * @param {string | number | null | undefined} params.id - The ID to validate and potentially translate.
 *
 */
export const useValidatedEntityId = <
  TEntity extends keyof SUPPORTED_ENTITIES,
  TReturnedId = SUPPORTED_ENTITIES[TEntity],
>({
  type,
  id,
}: {
  type: TEntity;
  id: BaseEntityId | string | number | null | undefined;
}):
  | { id: TReturnedId; isLoading: false; isError: false }
  | {
      id: null;
      isLoading: true;
      isError: false;
    }
  | {
      id: null;
      isLoading: false;
      isError: true;
    } => {
  const isEntityId = isBaseEntityID(id);
  const {
    data: entity_ids,
    isError,
    isLoading,
  } = useTranslateEntityIdQuery(
    id && isEntityId
      ? {
          [type]: [id],
        }
      : skipToken,
  );

  return useMemo(() => {
    if (isNumber(id)) {
      // no need to translate anything if the id is already not a entity id
      return {
        id: id as TReturnedId,
        isLoading: false,
        isError: false,
      } as const;
    }

    if (isLoading) {
      return {
        id: null,
        isLoading: true,
        isError: false,
      } as const;
    }

    if (!isEntityId || isError) {
      return {
        id: null,
        isLoading: false,
        isError: true,
      } as const;
    }

    if (entity_ids && entity_ids[id]?.status === "ok") {
      return {
        id: entity_ids[id].id as TReturnedId,
        isLoading: false,
        isError: false,
      } as const;
    }

    // something went wrong, either entity_ids is empty or the translation failed
    return { id: null, isLoading: false, isError: true } as const;
  }, [isEntityId, isLoading, isError, entity_ids, id]);
};

function isNumber(num: unknown): num is number {
  return typeof num === "number" && Number.isFinite(num) && !Number.isNaN(num);
}
