import { P, match } from "ts-pattern";

import {
  type EntityType,
  useTranslateEntityIdQuery,
} from "metabase/api/entity-id";

type ValidIdForEntityProps = {
  type: EntityType;
  id: unknown;
};

export const useValidIdForEntity = ({ type, id }: ValidIdForEntityProps) => {
  const {
    data: entity_ids,
    isError,
    isLoading,
  } = useTranslateEntityIdQuery({
    [type]: [id],
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
