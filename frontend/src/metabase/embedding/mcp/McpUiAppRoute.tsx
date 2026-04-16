import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { b64_to_utf8 } from "metabase/utils/encoding";
import type { Card } from "metabase-types/api";

import { useMcpApp } from "./hooks/useMcpApp";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext } = useMcpApp();

  const [isSettingsReady, setIsSettingsReady] = useState(false);

  const { instanceUrl } = window.metabaseConfig ?? { instanceUrl: "" };

  const scheme: ResolvedColorScheme =
    hostContext?.theme === "dark" ? "dark" : "light";

  const hostCssVariables: Record<string, string> = useMemo(
    () => hostContext?.styles?.variables ?? {},
    [hostContext?.styles?.variables],
  );

  const safeAreaInsets = hostContext?.safeAreaInsets ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  const deserializedCard = useMemo(() => {
    if (!query) {
      return null;
    }

    try {
      return {
        display: "table",
        dataset_query: JSON.parse(b64_to_utf8(query)),
        visualization_settings: {},
      } as Card;
    } catch {
      return null;
    }
  }, [query]);

  const theme = useMemo(
    () => buildMcpAppsTheme(hostCssVariables, scheme),
    [hostCssVariables, scheme],
  );

  // The OSS no-op initAuth never loads user or settings. Do it ourselves so
  // selectors like getTokenFeature has populated settings.
  // We also no-op the EE auth flow (auth.ts) when in MCP Apps route.
  useEffect(() => {
    Promise.all([
      store.dispatch(refreshCurrentUser()),
      store.dispatch(refreshSiteSettings()),
    ]).then(() => setIsSettingsReady(true));
  }, []);

  const isReady = !!(
    instanceUrl &&
    hostContext &&
    isSettingsReady &&
    deserializedCard
  );

  useEffect(() => {
    // Remove the loading indicator on the HTML page once the app is ready
    if (isReady) {
      document.getElementById("mcp-loading")?.remove();
    }
  }, [isReady]);

  const containerStyle: CSSProperties = {
    boxSizing: "border-box",
    backgroundColor: theme.colors?.background,
    height: "500px",

    // Apply safe area insets from the host environment.
    padding: `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`,
  };

  if (!isReady) {
    return null;
  }

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <div style={containerStyle}>
        <SdkQuestion
          deserializedCard={deserializedCard}
          isSaveEnabled={false}
          // we should never show query builder in chat interfaces
          withEditorButton={false}
          height="500px"
        />
      </div>
    </ComponentProvider>
  );
}
