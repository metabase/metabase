import { useMemo } from "react";
import { t } from "ttag";

import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { extractEntityIdFromJwtToken, isJWT } from "metabase/lib/utils";

export const useExtractEntityIdFromJwtToken = <TEntityId>({
  isStaticEmbedding,
  entityId,
  token,
}: {
  isStaticEmbedding: boolean;
  entityId: TEntityId | undefined;
  token: SdkEntityToken | undefined;
}): {
  entityId: TEntityId | null;
  token: SdkEntityToken | null;
  tokenError?: string;
} => {
  return useMemo<{
    entityId: TEntityId | null;
    token: SdkEntityToken | null;
  }>(() => {
    if (isJWT(entityId)) {
      return {
        entityId: null,
        token: null,
        tokenError: t`Passed id cannot be a JWT token.`,
      };
    }

    if (token) {
      if (!isStaticEmbedding) {
        return {
          entityId: null,
          token: null,
          tokenError: t`Passing a token is only allowed for anonymous embedding.`,
        };
      }

      if (!isJWT(token)) {
        return {
          entityId: null,
          token: null,
          tokenError: t`Passed token is not a valid JWT token.`,
        };
      }

      return { entityId: extractEntityIdFromJwtToken(token), token };
    }

    if (entityId) {
      return {
        entityId,
        token: null,
      };
    }

    return {
      entityId: null,
      token: null,
    };
  }, [entityId, isStaticEmbedding, token]);
};
