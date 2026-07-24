import { useEffect, useState } from "react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { refetchCurrentUser, refetchSiteSettings } from "metabase/api";

import {
  type McpAppsUserAndSettingsFetchErrorType,
  getMcpAppsUserAndSettingsFetchErrorMessage,
  getMcpAppsUserAndSettingsFetchErrorType,
} from "../utils/getMcpAppsUserAndSettingsFetchError";

interface UseMcpUserAndSettingsFetchOptions {
  instanceUrl: string;
  sessionToken: string;
  store: SdkStore;
}

interface UseMcpUserAndSettingsFetchResult {
  isSettingsReady: boolean;
  userAndSettingsFetchError: string | null;
}

export function useMcpUserAndSettingsFetch({
  instanceUrl,
  sessionToken,
  store,
}: UseMcpUserAndSettingsFetchOptions): UseMcpUserAndSettingsFetchResult {
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  // The OSS no-op initAuth never loads user or settings. Do it ourselves so
  // selectors like getTokenFeature has populated settings.
  // We also no-op the EE auth flow (auth.ts) when in MCP Apps route.
  useEffect(() => {
    let isMounted = true;

    const setErrorByType = (type: McpAppsUserAndSettingsFetchErrorType) =>
      setFetchError(getMcpAppsUserAndSettingsFetchErrorMessage(type));

    async function fetchUserAndSettings() {
      try {
        setIsSettingsReady(false);
        setFetchError(null);

        if (!sessionToken) {
          setErrorByType("auth");
          return;
        }

        if (!instanceUrl) {
          setErrorByType("network");
          return;
        }

        // `unwrap` so an auth/network failure lands in the catch below.
        await Promise.all([
          store.dispatch(refetchCurrentUser()).unwrap(),
          store.dispatch(refetchSiteSettings()),
        ]);

        if (!isMounted) {
          return;
        }

        setIsSettingsReady(true);
      } catch (error) {
        console.error("Error initializing MCP app", error);

        if (isMounted) {
          setErrorByType(getMcpAppsUserAndSettingsFetchErrorType(error));
        }
      }
    }

    fetchUserAndSettings();

    return () => {
      isMounted = false;
    };
  }, [instanceUrl, sessionToken, store]);

  return { isSettingsReady, userAndSettingsFetchError: fetchError };
}
