import { type CSSProperties, useEffect, useMemo } from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { McpFeedbackButtons } from "./McpFeedbackButtons";
import { McpQueryBar } from "./McpQueryBar";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";
import { useHandleMcpDrillThrough } from "./hooks/useHandleMcpDrillThrough";
import { useMcpApp } from "./hooks/useMcpApp";
import { useMcpUserAndSettingsFetch } from "./hooks/useMcpUserAndSettingsFetch";
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
  const { query, prompt, hostContext, app } = useMcpApp();

  const handleDrillThrough = useHandleMcpDrillThrough(app);

  const {
    instanceUrl = "",
    sessionToken = "",
    mcpSessionId = "",
  } = (window.metabaseConfig as {
    instanceUrl: string;
    sessionToken: string;
    mcpSessionId: string;
  }) ?? {};

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

    return getMcpDeserializedCard(query);
  }, [query]);

  const theme = useMemo(
    () => buildMcpAppsTheme(hostCssVariables, scheme),
    [hostCssVariables, scheme],
  );

  const { isSettingsReady, userAndSettingsFetchError } =
    useMcpUserAndSettingsFetch({
      instanceUrl,
      sessionToken,
      store,
    });

  const isReady = !!(
    instanceUrl &&
    hostContext &&
    isSettingsReady &&
    deserializedCard
  );

  useEffect(() => {
    // Remove the loading indicator on the HTML page once the app is ready or
    // when initialization fails and the route can render its own error.
    if (isReady || userAndSettingsFetchError) {
      document.getElementById("mcp-loading")?.remove();
    }
  }, [isReady, userAndSettingsFetchError]);

  const height = "500px";
  const visualizationHeight = `calc(${height} - 8.5rem)`;
  const safeAreaMargins = `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`;

  const containerStyle: CSSProperties = {
    height,
    margin: safeAreaMargins,
    background: theme.colors?.background,
  };

  const renderContent = () => {
    if (userAndSettingsFetchError) {
      return <SdkError message={userAndSettingsFetchError} />;
    }

    if (!isReady) {
      return null;
    }

    return (
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
          <Flex
            px="lg"
            align="center"
            justify="space-between"
            style={{ flexShrink: 0 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <McpQuestionTitle />
            </div>

            <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
              <McpFeedbackButtons
                instanceUrl={instanceUrl}
                sessionToken={sessionToken}
                mcpSessionId={mcpSessionId}
                prompt={prompt}
                query={query}
              />
            </Flex>
          </Flex>

          <Flex px="xs" flex={1} style={{ overflow: "hidden" }}>
            <SdkQuestion.QuestionVisualization height={visualizationHeight} />
          </Flex>

          <Flex px="lg">
            <McpQueryBar app={app} instanceUrl={instanceUrl} />
          </Flex>
        </Flex>
      </SdkQuestion>
    );
  };

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <div style={containerStyle}>{renderContent()}</div>
    </ComponentProvider>
  );
}
