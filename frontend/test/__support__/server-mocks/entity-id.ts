import fetchMock from "fetch-mock";

import type { TranslateEntityIdRequest } from "metabase/api";
import type {
  BaseEntityId,
  CardId,
  CollectionId,
  DashboardId,
} from "metabase-types/api";

type SUPPORTED_ENTITIES = {
  dashboard: DashboardId;
  card: CardId;
  collection: CollectionId;
};

type EntityIdMappingParameter = Partial<{
  [EntityType in keyof SUPPORTED_ENTITIES]: Record<
    BaseEntityId,
    SUPPORTED_ENTITIES[EntityType]
  >;
}>;

export function setupEntityIdEndpoint(
  entityIdMappings: EntityIdMappingParameter,
) {
  fetchMock.post(
    "path:/api/util/entity_id",
    async (_url: string, options: RequestInit) => {
      const body = JSON.parse((await options.body) as string) as {
        entity_ids: TranslateEntityIdRequest;
      };
      const requestedIdMap = body?.entity_ids ?? {};
      const allRequestedPairs = Object.entries(requestedIdMap).flatMap(
        ([typeString, idArray]) =>
          (idArray ?? []).map((id) => ({
            entityType: typeString,
            entityId: id,
          })),
      );
      const resultMapEntries = allRequestedPairs.map(
        ({
          entityType,
          entityId,
        }: {
          entityType: string;
          entityId: BaseEntityId;
        }) => {
          const mappedValue =
            entityIdMappings[entityType as keyof SUPPORTED_ENTITIES]?.[
              entityId
            ];
          const responseItem =
            mappedValue !== undefined
              ? { status: "ok", id: mappedValue, type: entityType }
              : { status: "not-found", id: null, type: entityType };
          return [entityId, responseItem];
        },
      );

      const responseMap = Object.fromEntries(resultMapEntries);

      return {
        entity_ids: responseMap,
      };
    },
  );
}
