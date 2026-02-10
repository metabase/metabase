import { useEffect, useMemo, useRef } from "react";

import { printUsageProblemToConsole } from "embedding-sdk-bundle/lib/print-usage-problem";
import { getSdkUsageProblem } from "embedding-sdk-bundle/lib/usage-problem";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { setUsageProblem } from "embedding-sdk-bundle/store/reducer";
import {
  getHasTokenFeature,
  getIsGuestEmbedRaw,
} from "embedding-sdk-bundle/store/selectors";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { useSetting } from "metabase/common/hooks";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkUsageProblem({
  authConfig,
  allowConsoleLog = true,
  session,
  isLocalHost,
}: {
  authConfig: MetabaseAuthConfig;
  allowConsoleLog?: boolean;
  session: MetabaseEmbeddingSessionToken | null;
  isLocalHost?: boolean;
}) {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbedRaw);

  const hasLoggedRef = useRef(false);

  const dispatch = useSdkDispatch();

  // When the setting haven't been loaded or failed to query, we assume that the
  // feature is _enabled_ first. Otherwise, when a user's instance is temporarily down,
  // their customer would see an alarming error message on production.
  const isEnabled =
    useSetting(EMBEDDING_SDK_CONFIG.enableEmbeddingSettingKey) ?? true;

  const hasTokenFeature = useSdkSelector(getHasTokenFeature);

  const isDevelopmentMode = useSdkSelector((state) => {
    // Assume that we are not in development mode until the setting is loaded
    if (!state.settings.values?.["token-features"]) {
      return false;
    }

    return getTokenFeature(state, "development_mode");
  });

  const usageProblem = useMemo(() => {
    return getSdkUsageProblem({
      isGuestEmbed,
      authConfig,
      hasTokenFeature,
      isEnabled,
      isDevelopmentMode,
      session,
      isLocalHost,
    });
  }, [
    isGuestEmbed,
    authConfig,
    hasTokenFeature,
    isEnabled,
    isDevelopmentMode,
    session,
    isLocalHost,
  ]);

  useEffect(() => {
    // SDK components will stop rendering if a license error is detected.
    dispatch(setUsageProblem(usageProblem));

    // Log the problem to the console once.
    if (!hasLoggedRef.current && allowConsoleLog) {
      printUsageProblemToConsole(usageProblem);
      hasLoggedRef.current = true;
    }
  }, [usageProblem, allowConsoleLog, dispatch]);

  return usageProblem;
}
