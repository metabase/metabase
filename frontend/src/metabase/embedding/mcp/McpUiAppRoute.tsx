import { type CSSProperties, useEffect, useMemo } from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { McpExploreButton } from "./McpExploreButton";
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
const CONTENT_HEIGHT = "500px";
const FOOTER_HEIGHT = "50px";

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

  const height = `calc(${CONTENT_HEIGHT} + ${FOOTER_HEIGHT})`;
  const visualizationHeight = `calc(${CONTENT_HEIGHT} - 8.5rem)`;
  const safeAreaPadding = {
    top: Math.max(safeAreaInsets.top, 0),
    right: Math.max(safeAreaInsets.right, 0),
    bottom: Math.max(safeAreaInsets.bottom, 0),
    left: Math.max(safeAreaInsets.left, 0),
  };

  const containerStyle: CSSProperties = {
    height,
    background: theme.colors?.background,
  };

  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    paddingTop: `calc(var(--mantine-spacing-lg) + ${safeAreaPadding.top}px)`,
    paddingRight: safeAreaPadding.right,
    paddingLeft: safeAreaPadding.left,
  };

  const footerStyle: CSSProperties = {
    boxSizing: "border-box",
    paddingRight: safeAreaPadding.right,
    paddingTop: safeAreaPadding.bottom,
    paddingBottom: safeAreaPadding.bottom,
    paddingLeft: safeAreaPadding.left,
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
          h={CONTENT_HEIGHT}
          py="lg"
          gap="sm"
          style={contentStyle}
        >
          <Flex px="lg" align="center" style={{ flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <McpQuestionTitle />
            </div>
          </Flex>

          <Flex px="xs" flex={1} style={{ overflow: "hidden" }}>
            <SdkQuestion.QuestionVisualization height={visualizationHeight} />
          </Flex>

          <Flex px="lg">
            <McpQueryBar />
          </Flex>
        </Flex>

        <Flex
          h={FOOTER_HEIGHT}
          align="center"
          justify="space-between"
          bg="background-secondary"
          style={footerStyle}
        >
          <Flex align="center" gap="xs">
            <McpFeedbackButtons
              instanceUrl={instanceUrl}
              sessionToken={sessionToken}
              mcpSessionId={mcpSessionId}
              prompt={prompt}
              query={query}
            />
          </Flex>

          <McpExploreButton app={app} instanceUrl={instanceUrl} />
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
