import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type {
  MetabaseFetchStaticTokenFn,
  MetabaseFetchStaticTokenFnData,
} from "embedding-sdk-bundle/types/refresh-token";
import { isJWT } from "metabase/lib/utils";

export const getResolvedEntityIdForStaticLikeEntity = async ({
  entityType,
  entityId,
  isStaticEmbedding,
  customFetchStaticTokenFn,
}: Pick<MetabaseFetchStaticTokenFnData, "entityType"> & {
  entityId: MetabaseFetchStaticTokenFnData["entityId"] | null | undefined;
  isStaticEmbedding: boolean;
  customFetchStaticTokenFn: MetabaseFetchStaticTokenFn | null | undefined;
}): Promise<SdkDashboardId | SdkQuestionId | null | undefined> => {
  if (entityId === null || entityId === undefined || !isStaticEmbedding) {
    return entityId;
  }

  if (isJWT(entityId)) {
    return entityId;
  }

  const fetchedStaticToken = await customFetchStaticTokenFn?.({
    entityType,
    entityId,
  });

  return fetchedStaticToken?.jwt ?? null;
};
