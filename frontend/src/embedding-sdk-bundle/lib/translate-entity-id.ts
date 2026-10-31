import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type EntityType,
  type TranslateEntityIdResponse,
  entityIdApi,
} from "metabase/api/entity-id";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { isBaseEntityID } from "metabase-types/api";

/**
 * The numeric id of the `type` entity with `entityId`. Throws when the
 * instance has no such entity, as a data app's questions and actions are
 * missing until its repository is imported.
 */
export async function translateEntityId(
  store: SdkStore,
  type: EntityType,
  entityId: string,
): Promise<number> {
  if (!isBaseEntityID(entityId)) {
    throw new Error(`${entityId} is not an entity ID.`);
  }

  const response: TranslateEntityIdResponse = await runRtkEndpoint(
    { [type]: [entityId] },
    store.dispatch,
    entityIdApi.endpoints.translateEntityId,
    { forceRefetch: false },
  );
  const translation = response[entityId];

  if (translation?.status !== "ok" || typeof translation.id !== "number") {
    throw new Error(
      `The ${type} ${entityId} does not exist. Import the app's repository to create it.`,
    );
  }

  return translation.id;
}
