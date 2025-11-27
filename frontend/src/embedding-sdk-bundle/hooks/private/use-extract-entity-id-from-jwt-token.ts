import { useMemo } from "react";
import { t } from "ttag";

import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { extractEntityIdFromJwtToken, isJWT } from "metabase/lib/utils";

export const useExtractEntityIdFromJwtToken = <TEntityId>({
  isGuestEmbed,
  entityId,
  token,
}: {
  isGuestEmbed: boolean;
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
        tokenError: t`JWT tokens cannot be passed as id. Use the token prop instead.`,
      };
    }

    if (isGuestEmbed && entityId) {
      return {
        entityId: null,
        token: null,
        tokenError: t`A valid JWT token is required to be passed in guest embeds mode.`,
      };
    }

    if (token) {
      if (!isGuestEmbed) {
        return {
          entityId: null,
          token: null,
          tokenError: t`Passing a token is only allowed for guest embeds mode.`,
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
  }, [entityId, isGuestEmbed, token]);
};
