import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { Box, Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { b64_to_utf8 } from "metabase/utils/encoding";
import type { Card } from "metabase-types/api";

import { McpQuestionTitle } from "./McpQuestionTitle";
import { useHandleMcpDrillThrough } from "./hooks/useHandleMcpDrillThrough";
import { useMcpApp } from "./hooks/useMcpApp";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, app } = useMcpApp();

  const [isSettingsReady, setIsSettingsReady] = useState(false);

  const handleDrillThrough = useHandleMcpDrillThrough(app);

  const { instanceUrl } = window.metabaseConfig ?? { instanceUrl: "" };

  const scheme: ResolvedColorScheme =
    hostContext?.theme === "dark" ? "dark" : "light";

  const hostCssVariables: Record<string, string> = useMemo(
    () => hostContext?.styles?.variables ?? {},
    [hostContext?.styles?.variables],
  );

  const safeAreaInsets = hostContext?.safeAreaInsets ?? DEFAULT_INSETS;

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

  const height = "500px";
  const visualizationHeight = `calc(${height} - 8.5rem)`;
  const safeAreaMargins = `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`;

  const containerStyle: CSSProperties = {
    height,
    margin: safeAreaMargins,
    background: theme.colors?.background,
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
          withChartTypeSelector={false}
          onDrillThrough={handleDrillThrough}
        >
          <Flex
            direction="column"
            justify="space-between"
            h="100%"
            py="lg"
            gap="sm"
          >
            <Box px="lg" style={{ flexShrink: 0 }}>
              <McpQuestionTitle />
            </Box>

            <Flex px="xs" flex={1} style={{ overflow: "hidden" }}>
              <SdkQuestion.QuestionVisualization height={visualizationHeight} />
            </Flex>

            {/* TODO(EMB-1620): add query explorer bar */}
            <Flex px="lg">
              <Box h="3.3rem" />
            </Flex>
          </Flex>
        </SdkQuestion>
      </div>
    </ComponentProvider>
  );
}
