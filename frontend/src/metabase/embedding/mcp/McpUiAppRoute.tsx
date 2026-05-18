import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { McpCardFooter } from "./McpCardFooter";
import { McpFeedbackArea } from "./McpFeedbackArea";
import { McpQuestionView } from "./McpQuestionView";
import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";
import { useHandleMcpDrillThrough } from "./hooks/useHandleMcpDrillThrough";
import { useMcpApp } from "./hooks/useMcpApp";
import { useMcpFeedback } from "./hooks/useMcpFeedback";
import { useMcpUserAndSettingsFetch } from "./hooks/useMcpUserAndSettingsFetch";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const CONTENT_HEIGHT = "500px";
const FOOTER_HEIGHT = "50px";
const FOOTER_HORIZONTAL_PADDING = 16;
const QUERY_BAR_RESERVED_HEIGHT = "calc(2rem + var(--mantine-spacing-sm))";

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { hostContext } = useMcpApp();

  const { instanceUrl = "", sessionToken = "" } =
    (window.metabaseConfig as {
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

  const theme = useMemo(
    () => buildMcpAppsTheme(hostCssVariables, scheme),
    [hostCssVariables, scheme],
  );

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <McpUiAppRouteContent
        instanceUrl={instanceUrl}
        sessionToken={sessionToken}
      />
    </ComponentProvider>
  );
}

interface McpUiAppRouteContentProps {
  instanceUrl: string;
  sessionToken: string;
}

function McpUiAppRouteContent({
  instanceUrl,
  sessionToken,
}: McpUiAppRouteContentProps) {
  const { query, prompt, hostContext, app } = useMcpApp();
  const [isQueryBarVisible, setIsQueryBarVisible] = useState(false);

  const handleDrillThrough = useHandleMcpDrillThrough(app);

  const { mcpSessionId = "" } =
    (window.metabaseConfig as {
      instanceUrl: string;
      sessionToken: string;
      mcpSessionId: string;
    }) ?? {};

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

  const height = `calc(${CONTENT_HEIGHT} + ${FOOTER_HEIGHT})`;

  const visualizationHeight = isQueryBarVisible
    ? `calc(${CONTENT_HEIGHT} - 8.5rem)`
    : `calc(${CONTENT_HEIGHT} - 8.5rem + ${QUERY_BAR_RESERVED_HEIGHT})`;

  const safeAreaPadding = {
    top: Math.max(safeAreaInsets.top, 0),
    right: Math.max(safeAreaInsets.right, 0),
    bottom: Math.max(safeAreaInsets.bottom, 0),
    left: Math.max(safeAreaInsets.left, 0),
  };

  const containerStyle: CSSProperties = {
    height,
  };

  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    paddingTop: `calc(var(--mantine-spacing-lg) + ${safeAreaPadding.top}px)`,
    paddingRight: safeAreaPadding.right,
    paddingLeft: safeAreaPadding.left,
  };

  const feedbackContentStyle: CSSProperties = {
    boxSizing: "border-box",
  };

  const footerStyle: CSSProperties = {
    boxSizing: "border-box",
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

  const handleQueryBarVisibilityChange = useCallback((isVisible: boolean) => {
    setIsQueryBarVisible(isVisible);
  }, []);

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
        <McpQuestionView
          contentStyle={contentStyle}
          isTimeControlsVisible={isQueryBarVisible}
          onTimeControlsVisibilityChange={handleQueryBarVisibilityChange}
          visualizationHeight={visualizationHeight}
        />

        <McpCardFooter
          app={app}
          footerStyle={footerStyle}
          instanceUrl={instanceUrl}
          isSubmittingFeedback={isSubmittingFeedback}
          onSelectFeedback={setSelectedFeedback}
          submittedFeedback={submittedFeedback}
        />
      </SdkQuestion>
    );

  const renderFeedbackView = () =>
    selectedFeedback && (
      <Flex h={height} w="100%" style={feedbackContentStyle}>
        <McpFeedbackArea
          feedback={selectedFeedback}
          isSubmitting={isSubmittingFeedback}
          onCancel={() => setSelectedFeedback(null)}
          onSubmit={handleFeedbackSubmit}
        />
      </Flex>
    );

  const renderContentView = () => {
    if (userAndSettingsFetchError) {
      return <SdkError message={userAndSettingsFetchError} />;
    }

    if (!isReady) {
      return null;
    }

    return selectedFeedback !== null
      ? renderFeedbackView()
      : renderQuestionCardView();
  };

  return <div style={containerStyle}>{renderContentView()}</div>;
}
