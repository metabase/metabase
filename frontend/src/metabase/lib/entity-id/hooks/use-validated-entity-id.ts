import { P, match } from "ts-pattern";

import { skipToken } from "metabase/api";
import {
  type EntityType,
  useTranslateEntityIdQuery,
} from "metabase/api/entity-id";
import { isBaseEntityID } from "metabase-types/api/entity-id";

type UseValidatedEntityIdProps = {
  type: EntityType;
  id: string | number | null | undefined;
};

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
export const useValidatedEntityId = ({
  type,
  id,
}: UseValidatedEntityIdProps) => {
  const {
    data: entity_ids,
    isError,
    isLoading,
  } = useTranslateEntityIdQuery(
    id
      ? {
          [type]: [id],
        }
      : skipToken,
  );

  return match({ id, entity_ids, isError, isLoading })
    .with({ isLoading: true }, () => null)
    .with(
      {
        id: P.string,
        entity_ids: P.not(P.nullish),
        isError: false,
        isLoading: false,
      },
      ({ id, entity_ids }) =>
        isBaseEntityID(id) && entity_ids[id]?.status === "success"
          ? entity_ids[id].id
          : null,
    )
    .otherwise(() => id);
};
