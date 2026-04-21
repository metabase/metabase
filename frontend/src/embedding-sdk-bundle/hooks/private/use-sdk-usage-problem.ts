import { useEffect, useRef } from "react";

import { printUsageProblemToConsole } from "embedding-sdk-bundle/lib/print-usage-problem";
import { getSdkUsageProblem } from "embedding-sdk-bundle/lib/usage-problem";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { setUsageProblem } from "embedding-sdk-bundle/store/reducer";
import {
  getHasTokenFeature,
  getIsGuestEmbedRaw,
  getUsageProblem,
} from "embedding-sdk-bundle/store/selectors";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseAuthConfig } from "metabase/embed/sdk-bundle/types/auth-config";
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

  // Sync the computed usage problem to the store whenever inputs change.
  // This lets other consumers (e.g. SDK components that stop rendering on
  // license errors) read the problem from the store.
  useEffect(() => {
    dispatch(
      setUsageProblem(
        getSdkUsageProblem({
          isGuestEmbed,
          authConfig,
          hasTokenFeature,
          isEnabled,
          isDevelopmentMode,
          session,
          isLocalHost,
        }),
      ),
    );
  }, [
    isGuestEmbed,
    authConfig,
    hasTokenFeature,
    isEnabled,
    isDevelopmentMode,
    session,
    isLocalHost,
    dispatch,
  ]);

  // Read the problem from the store rather than from a local useMemo so that
  // external dispatches (e.g. the "Hide" button calling setUsageProblem(null))
  // are reflected here.
  const usageProblem = useSdkSelector(getUsageProblem);

  useEffect(() => {
    // Log the problem to the console once.
    if (!hasLoggedRef.current && allowConsoleLog) {
      printUsageProblemToConsole(usageProblem);
      hasLoggedRef.current = true;
    }
  }, [usageProblem, allowConsoleLog, dispatch]);

  return usageProblem;
}
