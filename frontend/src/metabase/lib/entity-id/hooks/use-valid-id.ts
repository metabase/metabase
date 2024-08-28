import { P, match } from "ts-pattern";

import { skipToken } from "metabase/api";
import {
  type EntityType,
  useTranslateEntityIdQuery,
} from "metabase/api/entity-id";
import { isNanoID } from "metabase-types/api/entity-id";

type ValidIdForEntityProps = {
  type: EntityType;
  id: string | number | null | undefined;
};

export const useValidIdForEntity = ({ type, id }: ValidIdForEntityProps) => {
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
        id: P.not(P.nullish),
        entity_ids: P.not(P.nullish),
        isError: false,
        isLoading: false,
      },
      ({ id, entity_ids }) =>
        isNanoID(id) && entity_ids[id]?.status === "success"
          ? entity_ids[id].id
          : null,
    )
    .otherwise(() => id);
};
