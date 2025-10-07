import { useMemo } from "react";

import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { extractEntityIdFromJwtToken, isJWT } from "metabase/lib/utils";

export const useExtractEntityIdFromJwtToken = <TEntityId>({
  entityId,
  token,
}: {
  entityId: TEntityId | undefined;
  token: SdkEntityToken | undefined;
}) => {
  return useMemo<{
    entityId: TEntityId | null;
    token: SdkEntityToken | null;
  }>(() => {
    if (token) {
      return { entityId: extractEntityIdFromJwtToken(token), token };
    }

    if (isJWT(entityId)) {
      return {
        entityId: extractEntityIdFromJwtToken(entityId),
        token: entityId,
      };
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
  }, [entityId, token]);
};
