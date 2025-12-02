import { useMemo } from "react";
import { t } from "ttag";

import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { extractResourceIdFromJwtToken, isJWT } from "metabase/lib/utils";

export const useExtractResourceIdFromJwtToken = <TEntityId>({
  isGuestEmbed,
  resourceId,
  token,
}: {
  isGuestEmbed: boolean;
  resourceId: TEntityId | undefined;
  token: SdkEntityToken | undefined;
}): {
  resourceId: TEntityId | null;
  token: SdkEntityToken | null;
  tokenError?: string;
} => {
  return useMemo<{
    resourceId: TEntityId | null;
    token: SdkEntityToken | null;
  }>(() => {
    if (isJWT(resourceId)) {
      return {
        resourceId: null,
        token: null,
        tokenError: t`JWT tokens cannot be passed as id. Use the token prop instead.`,
      };
    }

    if (isGuestEmbed && resourceId) {
      return {
        resourceId: null,
        token: null,
        tokenError: t`A valid JWT token is required to be passed in guest embeds mode.`,
      };
    }

    if (token) {
      if (!isGuestEmbed) {
        return {
          resourceId: null,
          token: null,
          tokenError: t`Passing a token is only allowed for guest embeds mode.`,
        };
      }

      if (!isJWT(token)) {
        return {
          resourceId: null,
          token: null,
          tokenError: t`Passed token is not a valid JWT token.`,
        };
      }

      return { resourceId: extractResourceIdFromJwtToken(token), token };
    }

    if (resourceId) {
      return {
        resourceId,
        token: null,
      };
    }

    return {
      resourceId: null,
      token: null,
    };
  }, [resourceId, isGuestEmbed, token]);
};
