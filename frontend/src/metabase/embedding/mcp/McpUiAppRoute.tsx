import { type CSSProperties, useEffect, useMemo } from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { SdkInternalNavigationBackButton } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationBackButton";
import { useSdkInternalNavigationOptional } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { Box, Flex, Stack } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

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

function McpQuestionLayout({
  app,
  instanceUrl,
  visualizationHeight,
}: {
  app: ReturnType<typeof useMcpApp>["app"];
  instanceUrl: string;
  visualizationHeight: string;
}) {
  const navigation = useSdkInternalNavigationOptional();

  const isDrillThroughActive =
    navigation?.currentEntry?.type === "question-drill";

  const titleStyle: CSSProperties = {
    flexShrink: 0,
    marginLeft: isDrillThroughActive ? 12 : undefined,
  };

  const bodyStyle: CSSProperties = {
    overflow: "hidden",
    marginLeft: isDrillThroughActive ? 12 : undefined,
    marginRight: isDrillThroughActive ? 24 : undefined,
  };

  return (
    <Flex
      direction="column"
      justify="space-between"
      h="100%"
      py="lg"
      gap="sm"
      data-drill-through-active={isDrillThroughActive || undefined}
    >
      <Box px={isDrillThroughActive ? 0 : "lg"} style={titleStyle}>
        <Stack align="flex-start" gap="xs">
          <SdkInternalNavigationBackButton label="Back" />

          <Box px={isDrillThroughActive ? "26px" : "md"} py="sm">
            <McpQuestionTitle />
          </Box>
        </Stack>
      </Box>

      <Flex px={isDrillThroughActive ? "md" : "xs"} flex={1} style={bodyStyle}>
        <SdkQuestion.QuestionVisualization height={visualizationHeight} />
      </Flex>

      <Flex px="lg">
        <McpQueryBar app={app} instanceUrl={instanceUrl} />
      </Flex>
    </Flex>
  );
}

export function McpUiAppRoute() {
  const { query, hostContext, app, isClaude } = useMcpApp();

  const handleDrillThrough = useHandleMcpDrillThrough(app, { isClaude });

  const { instanceUrl = "", sessionToken = "" } =
    (window.metabaseConfig as {
      instanceUrl: string;
      sessionToken: string;
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
        <McpQuestionLayout
          app={app}
          instanceUrl={instanceUrl}
          visualizationHeight={visualizationHeight}
        />
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
