import { useEffect, useState } from "react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { currentUserApi, loadCurrentUser } from "metabase/current-user";
import { settingsApi } from "metabase/settings";
import MetabaseSettings from "metabase/utils/settings";
import type { User } from "metabase-types/api";

import { fetchMcpBootstrap } from "../api";
import {
  type McpAppsUserAndSettingsFetchErrorType,
  getMcpAppsUserAndSettingsFetchErrorMessage,
  getMcpAppsUserAndSettingsFetchErrorType,
} from "../utils/getMcpAppsUserAndSettingsFetchError";

interface UseMcpUserAndSettingsFetchOptions {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
  store: SdkStore;
}

interface UseMcpUserAndSettingsFetchResult {
  isSettingsReady: boolean;
  userAndSettingsFetchError: string | null;
}

export function useMcpUserAndSettingsFetch({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  store,
}: UseMcpUserAndSettingsFetchOptions): UseMcpUserAndSettingsFetchResult {
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  // The OSS no-op initAuth never loads user or settings, and we no-op the EE auth
  // flow (auth.ts) on the MCP Apps route, so the app has to seed them itself.
  useEffect(() => {
    if (isSettingsReady) {
      return;
    }

    let isMounted = true;

    const setErrorByType = (type: McpAppsUserAndSettingsFetchErrorType) =>
      setFetchError(getMcpAppsUserAndSettingsFetchErrorMessage(type));

    async function fetchUserAndSettings() {
      try {
        setIsSettingsReady(false);
        setFetchError(null);

        if (!uiCredential || !mcpSessionId) {
          return;
        }

        if (!instanceUrl) {
          setErrorByType("network");
          return;
        }

        const { user, settings } = await fetchMcpBootstrap({
          instanceUrl,
          uiCredential,
          mcpSessionId,
        });

        if (!isMounted) {
          return;
        }

        // Seed the caches the shared components read from, rather than letting them
        // fetch `/api/user/current` and `/api/session/properties` on demand: the UI
        // credential deliberately does not authenticate the general REST API.

        // The cache is typed as the full `User`, but the bootstrap projection is narrower
        // on purpose — that narrowing is what the endpoint exists for. Fields the iframe
        // does not render read back as `undefined`; the `metabase/current-user` selectors
        // all access them optionally, so a component that needs one has to add it to
        // `McpAppsBootstrapUser` and to `::bootstrap-user` on the server.
        const currentUser = user as User;

        store.dispatch(
          currentUserApi.util.upsertQueryData(
            "getCurrentUser",
            undefined,
            currentUser,
          ),
        );
        store.dispatch(
          settingsApi.util.upsertQueryData(
            "getSessionProperties",
            undefined,
            settings,
          ),
        );
        // Subscribe so RTK doesn't evict the seeded entries — it drops entries with no
        // subscribers when they are invalidated. Neither `initiate()` refetches: the entry
        // is already fulfilled and neither `forceRefetch` nor `refetchOnMountOrArgChange`
        // is set, so the query thunk's condition bails out.
        //
        // The subscription is also the one way this design can break. An invalidation of
        // `current-user` or `session-properties` would refetch, and both now fail: the
        // former 401s, and the latter — mounted without `+auth` — answers anonymously with
        // public-only settings, silently dropping the authenticated ones. Nothing in the
        // iframe's tree dispatches a mutation today; the first one added has to reckon with
        // this.
        store.dispatch(loadCurrentUser());
        store.dispatch(settingsApi.endpoints.getSessionProperties.initiate());
        // Consumers outside the store and React tree (i18n, theming, dom helpers).
        MetabaseSettings.setAll(settings);

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
  }, [instanceUrl, isSettingsReady, uiCredential, mcpSessionId, store]);

  return { isSettingsReady, userAndSettingsFetchError: fetchError };
}
