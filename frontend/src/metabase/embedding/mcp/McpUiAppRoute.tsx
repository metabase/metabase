import { type CSSProperties, useEffect, useMemo } from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { useSelector } from "metabase/redux";
import { getIsHosted } from "metabase/selectors/settings";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { McpCardFooter } from "./McpCardFooter";
import { McpFeedbackArea } from "./McpFeedbackArea";
import { MCP_CONTENT_HEIGHT, McpQuestionView } from "./McpQuestionView";
import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";
import { useHandleMcpDrillThrough } from "./hooks/useHandleMcpDrillThrough";
import { type McpAppState, useMcpApp } from "./hooks/useMcpApp";
import { useMcpFeedback } from "./hooks/useMcpFeedback";
import { useMcpUserAndSettingsFetch } from "./hooks/useMcpUserAndSettingsFetch";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FOOTER_HEIGHT = "50px";
const FOOTER_HORIZONTAL_PADDING = 16;

interface McpUiAppRouteContentProps {
  app: McpAppState["app"];
  hostContext: McpAppState["hostContext"];
  instanceUrl: string;
  prompt: McpAppState["prompt"];
  query: McpAppState["query"];
  sessionToken: string;
}

interface McpMetabaseConfig {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
}

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { app, hostContext, prompt, query } = useMcpApp();

  const { instanceUrl = "", sessionToken = "" } =
    (window.metabaseConfig as McpMetabaseConfig) ?? {};

  const scheme: ResolvedColorScheme =
    hostContext?.theme === "dark" ? "dark" : "light";

  const hostCssVariables: Record<string, string> = useMemo(
    () => hostContext?.styles?.variables ?? {},
    [hostContext?.styles?.variables],
  );

  const theme = useMemo(
    () =>
      buildMcpAppsTheme({
        hostCssVariables,
        preset: scheme,
        agentName: hostContext?.userAgent,
      }),
    [hostCssVariables, scheme, hostContext?.userAgent],
  );

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <McpUiAppRouteContent
        app={app}
        hostContext={hostContext}
        instanceUrl={instanceUrl}
        prompt={prompt}
        query={query}
        sessionToken={sessionToken}
      />
    </ComponentProvider>
  );
}

function McpUiAppRouteContent({
  app,
  hostContext,
  instanceUrl,
  prompt,
  query,
  sessionToken,
}: McpUiAppRouteContentProps) {
  const handleDrillThrough = useHandleMcpDrillThrough(app);
  const isHosted = useSelector(getIsHosted);

  const { mcpSessionId = "" } =
    (window.metabaseConfig as McpMetabaseConfig) ?? {};

  const safeAreaInsets = hostContext?.safeAreaInsets ?? DEFAULT_INSETS;

  const deserializedCard = useMemo(() => {
    if (!query) {
      return null;
    }

    return getMcpDeserializedCard(query);
  }, [query]);

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

  const height = `calc(${MCP_CONTENT_HEIGHT} + ${FOOTER_HEIGHT})`;

  const safeAreaPadding = {
    top: Math.max(safeAreaInsets.top, 0),
    right: Math.max(safeAreaInsets.right, 0),
    bottom: Math.max(safeAreaInsets.bottom, 0),
    left: Math.max(safeAreaInsets.left, 0),
  };

  const containerStyle: CSSProperties = { height };
  const feedbackContainerStyle: CSSProperties = { boxSizing: "border-box" };

  const footerStyle: CSSProperties = {
    boxSizing: "border-box",
    borderTop: "1px solid var(--mb-color-border-neutral)",
    paddingRight: Math.max(safeAreaPadding.right, FOOTER_HORIZONTAL_PADDING),
    paddingTop: safeAreaPadding.bottom,
    paddingBottom: safeAreaPadding.bottom,
    paddingLeft: Math.max(safeAreaPadding.left, FOOTER_HORIZONTAL_PADDING),
  };

  const {
    isSubmittingFeedback,
    selectedFeedback,
    submittedFeedback,
    setSelectedFeedback,
    handleFeedbackSubmit,
  } = useMcpFeedback({
    instanceUrl,
    mcpSessionId,
    prompt,
    query,
    sessionToken,
  });

  const renderSdkQuestionContent = () => {
    if (selectedFeedback !== null) {
      return (
        // Keep the feedback overlay inside SdkQuestion's container because
        // it relies on the style from PublicComponentStyleWrapper
        <Flex h={height} w="100%" style={feedbackContainerStyle}>
          <McpFeedbackArea
            feedback={selectedFeedback}
            isSubmitting={isSubmittingFeedback}
            onCancel={() => setSelectedFeedback(null)}
            onSubmit={handleFeedbackSubmit}
          />
        </Flex>
      );
    }

    return (
      <>
        <McpQuestionView
          queryKey={query}
          safeAreaPaddingTop={safeAreaPadding.top}
        />

        <McpCardFooter
          app={app}
          footerStyle={footerStyle}
          instanceUrl={instanceUrl}
          isFeedbackEnabled={Boolean(isHosted)}
          isSubmittingFeedback={isSubmittingFeedback}
          onSelectFeedback={setSelectedFeedback}
          submittedFeedback={submittedFeedback}
        />
      </>
    );
  };

  const renderQuestionCardView = () =>
    deserializedCard && (
      <SdkQuestion
        deserializedCard={deserializedCard}
        isSaveEnabled={false}
        // we should never show query builder in chat interfaces
        withEditorButton={false}
        withChartTypeSelector={false}
        onDrillThrough={handleDrillThrough}
      >
        {renderSdkQuestionContent()}
      </SdkQuestion>
    );

  const renderContentView = () => {
    if (userAndSettingsFetchError) {
      return <SdkError message={userAndSettingsFetchError} />;
    }

    if (!isReady) {
      return null;
    }

    return renderQuestionCardView();
  };

  return <div style={containerStyle}>{renderContentView()}</div>;
}
