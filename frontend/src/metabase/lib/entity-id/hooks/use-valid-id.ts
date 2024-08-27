import { P, match } from "ts-pattern";

import { type EntityType, useTranslateEntityIdQuery } from "metabase/api";
import type { CardEntityId, CardId } from "metabase-types/api";

export const useValidIdForEntity = ({
  type,
  id,
}: {
  type: EntityType;
  id: CardId | CardEntityId | null | undefined;
}) => {
  const {
    data: entity_ids,
    isError,
    isLoading,
  } = useTranslateEntityIdQuery({
    [type]: typeof id === "string" ? [id] : [],
  });

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
        entity_ids[id]?.status === "success" ? entity_ids[id].id : null,
    )
    .otherwise(() => id);
};
