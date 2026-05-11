/* eslint-disable metabase/no-literal-metabase-strings */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { Box, Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type { Card } from "metabase-types/api";

import { McpQueryBar } from "./McpQueryBar";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";
import { useMcpApp } from "./hooks/useMcpApp";
import { useMcpUserAndSettingsFetch } from "./hooks/useMcpUserAndSettingsFetch";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const MAIN_QUESTION_HEIGHT = 500;
const DRILLED_QUESTION_HEIGHT = 220;
const DRILLED_QUESTION_VERTICAL_SPACE = 24;
type DrillThroughHandler = NonNullable<SdkQuestionProps["onDrillThrough"]>;

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, app } = useMcpApp();
  const [drilledCard, setDrilledCard] = useState<Card | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setDrilledCard(null);
  }, [query]);

  const handleDrillThrough = useCallback<DrillThroughHandler>(
    async ({ drillName, nextCard }) => {
      setDrilledCard(nextCard);

      try {
        await app?.updateModelContext({
          content: [
            {
              type: "text",
              text: `---
event: metabase-drill-through
drill-name: ${drillName ?? "unknown"}
card-name: ${nextCard.name ?? "Untitled question"}
---

The user drilled into the Metabase visualization. The app is showing the drill result below the original visualization, while the original question remains unchanged.`,
            },
          ],
          structuredContent: {
            event: "metabase-drill-through",
            drillName,
            cardName: nextCard.name,
            datasetQuery: nextCard.dataset_query,
          },
        });
      } catch {
        // The visual prototype should still work if the host declines context updates.
      }
    },
    [app],
  );

  const getStaticClickActionMode = useCallback<ClickActionModeGetter>(
    ({ question }) =>
      getEmbeddingMode({
        question,
        queryMode: EmbeddingSdkStaticMode,
      }),
    [],
  );

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

  const sendResizeRequest = useCallback(() => {
    if (!app) {
      return;
    }

    const container = containerRef.current;
    const containerRectHeight = container?.getBoundingClientRect().height ?? 0;
    const containerScrollHeight = container?.scrollHeight ?? 0;
    const containerOffsetHeight = container?.offsetHeight ?? 0;
    const documentElementHeight =
      document.documentElement.getBoundingClientRect().height;
    const documentScrollHeight = document.documentElement.scrollHeight;
    const bodyScrollHeight = document.body.scrollHeight;
    const fallbackHeight =
      MAIN_QUESTION_HEIGHT +
      (drilledCard
        ? DRILLED_QUESTION_HEIGHT + DRILLED_QUESTION_VERTICAL_SPACE
        : 0);
    const width = Math.ceil(window.innerWidth);
    const height = Math.ceil(
      Math.max(
        containerRectHeight,
        containerScrollHeight,
        containerOffsetHeight,
        documentElementHeight,
        documentScrollHeight,
        bodyScrollHeight,
        fallbackHeight,
      ),
    );

    app.sendSizeChanged({ width, height });
  }, [app, drilledCard]);

  useEffect(() => {
    if (!app || !isReady) {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      sendResizeRequest();
    });
    const delayedResize = window.setTimeout(() => {
      sendResizeRequest();
    }, 500);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(delayedResize);
    };
  }, [app, drilledCard, isReady, sendResizeRequest]);

  useEffect(() => {
    // Remove the loading indicator on the HTML page once the app is ready or
    // when initialization fails and the route can render its own error.
    if (isReady || userAndSettingsFetchError) {
      document.getElementById("mcp-loading")?.remove();
    }
  }, [isReady, userAndSettingsFetchError]);

  const height = `${MAIN_QUESTION_HEIGHT}px`;
  const visualizationHeight = `calc(${height} - 8.5rem)`;
  const drilledVisualizationHeight = `${DRILLED_QUESTION_HEIGHT}px`;
  const safeAreaMargins = `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`;

  const containerStyle: CSSProperties = {
    minHeight: height,
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
      <>
        <Box h={height}>
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
                <SdkQuestion.QuestionVisualization
                  height={visualizationHeight}
                />
              </Flex>

              <Flex px="lg">
                <McpQueryBar app={app} instanceUrl={instanceUrl} />
              </Flex>
            </Flex>
          </SdkQuestion>
        </Box>
        {drilledCard && (
          <Box px="xs" pb="lg">
            <SdkQuestion
              deserializedCard={drilledCard}
              isSaveEnabled={false}
              withEditorButton={false}
              withChartTypeSelector={false}
              getClickActionMode={getStaticClickActionMode}
              navigateToNewCard={null}
            >
              <SdkQuestion.QuestionVisualization
                height={drilledVisualizationHeight}
              />
            </SdkQuestion>
          </Box>
        )}
      </>
    );
  };

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <div ref={containerRef} style={containerStyle}>
        {renderContent()}
      </div>
    </ComponentProvider>
  );
}
