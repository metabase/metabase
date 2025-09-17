import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type {
  MetabaseFetchStaticTokenFn,
  MetabaseFetchStaticTokenFnData,
} from "embedding-sdk-bundle/types/refresh-token";
import { isJWT } from "metabase/lib/utils";

export const resolveTokenForMaybeStaticEntity = async ({
  entityType,
  entityId,
  isStaticEmbedding,
  customFetchStaticTokenFn,
}: Pick<MetabaseFetchStaticTokenFnData, "entityType"> & {
  entityId: MetabaseFetchStaticTokenFnData["entityId"] | null | undefined;
  isStaticEmbedding: boolean;
  customFetchStaticTokenFn: MetabaseFetchStaticTokenFn | null | undefined;
}): Promise<{
  entityId: SdkDashboardId | SdkQuestionId | null | undefined;
  isToken: boolean;
}> => {
  if (entityId === null || entityId === undefined || !isStaticEmbedding) {
    return {
      entityId,
      isToken: false,
    };
  }

  if (isJWT(entityId)) {
    return {
      entityId,
      isToken: true,
    };
  }

  const fetchedStaticToken = (
    await customFetchStaticTokenFn?.({
      entityType,
      entityId,
    })
  )?.jwt;

  return {
    entityId: fetchedStaticToken,
    isToken: !!fetchedStaticToken,
  };
};
