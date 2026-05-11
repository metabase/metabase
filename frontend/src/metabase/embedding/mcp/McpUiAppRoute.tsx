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
const MAX_RECENT_VIEWS = 5;
type DrillThroughHandler = NonNullable<SdkQuestionProps["onDrillThrough"]>;
type McpViewRole = "main" | "drill";
type McpViewContext = ReturnType<typeof getVisibleViewContext>;

function getViewName(card: Card, fallback: string) {
  return card.name ?? card.display ?? fallback;
}

function getVisibleViewContext({
  card,
  role,
  active,
}: {
  card: Card;
  role: McpViewRole;
  active: boolean;
}) {
  return {
    role,
    active,
    name: getViewName(
      card,
      role === "main" ? "Original question" : "Drill result",
    ),
    display: card.display,
    datasetQuery: card.dataset_query,
    drillCard:
      role === "drill"
        ? {
            name: card.name,
            display: card.display,
            dataset_query: card.dataset_query,
            visualization_settings: card.visualization_settings,
          }
        : undefined,
  };
}

function removeVolatileQueryKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeVolatileQueryKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, value]) => [key, removeVolatileQueryKeys(value)]),
    );
  }

  return value;
}

function getViewContextKey(view: McpViewContext) {
  return `${view.role}:${JSON.stringify(removeVolatileQueryKeys(view.datasetQuery))}`;
}

function getModelContextMarkdown({
  recentViews,
  visibleViews,
}: {
  recentViews: McpViewContext[];
  visibleViews: McpViewContext[];
}) {
  const activeView =
    visibleViews.find((view) => view.active) ?? visibleViews[0];
  const activeDrillCardJson = activeView?.drillCard
    ? JSON.stringify(activeView.drillCard, null, 2)
    : null;

  return `---
event: metabase-visible-views-changed
visible-view-count: ${visibleViews.length}
recent-view-count: ${recentViews.length}
recent-view-limit: ${MAX_RECENT_VIEWS}
active-view-role: ${activeView?.role ?? "none"}
active-view-name: ${activeView?.name ?? "none"}
---

The user is viewing ${visibleViews.length} Metabase MCP App view${
    visibleViews.length === 1 ? "" : "s"
  } in this app iframe.

Visible views:
${visibleViews
  .map(
    (view, index) =>
      `${index + 1}. ${view.active ? "ACTIVE " : ""}${view.role} view: ${
        view.name
      } (${view.display ?? "unknown"} visualization)`,
  )
  .join("\n")}

Recent views available for disambiguation (most recent first, limited to ${
    MAX_RECENT_VIEWS
  }):
${recentViews
  .map(
    (view, index) =>
      `${index + 1}. ${view.role} view: ${view.name} (${
        view.display ?? "unknown"
      } visualization)`,
  )
  .join("\n")}
${
  activeDrillCardJson
    ? `
Active drill nextCard:
\`\`\`json
${activeDrillCardJson}
\`\`\`
`
    : ""
}

Natural language query guidance:
- When the user says "this", "that", "the current view", "the drilled result", or asks a follow-up without naming another chart, treat the ACTIVE view as the current analytical context.
- When constructing a follow-up query from a drill result, use the active drill nextCard as the authoritative current query state, including its source, filters, aggregations, breakouts, joins, and selected fields.
- Use recentViews only for disambiguation and continuity; do not treat older recent views as active unless the user clearly refers to them.
- If multiple visible or recent views could match the user's wording, ask a brief clarifying question about which chart/view they mean instead of guessing.
- If both the main view and drilled view are relevant, preserve the main view as background context but prefer the active drilled view for ambiguous follow-ups.
- If the user explicitly refers to the original/main chart, use the main view instead of the active drill view.`;
}

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, app } = useMcpApp();
  const [drilledCard, setDrilledCard] = useState<Card | null>(null);
  const [recentViews, setRecentViews] = useState<McpViewContext[]>([]);
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
    setRecentViews([]);
  }, [query]);

  const handleDrillThrough = useCallback<DrillThroughHandler>(
    async ({ nextCard }) => {
      setDrilledCard(nextCard);
    },
    [],
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

  const visibleViews = useMemo<McpViewContext[]>(() => {
    if (!deserializedCard) {
      return [];
    }

    return [
      getVisibleViewContext({
        card: deserializedCard,
        role: "main",
        active: !drilledCard,
      }),
      ...(drilledCard
        ? [
            getVisibleViewContext({
              card: drilledCard,
              role: "drill" as const,
              active: true,
            }),
          ]
        : []),
    ];
  }, [deserializedCard, drilledCard]);

  useEffect(() => {
    const activeView = visibleViews.find((view) => view.active);

    if (!isReady || !activeView) {
      return;
    }

    setRecentViews((previousViews) => {
      const activeViewKey = getViewContextKey(activeView);

      return [
        activeView,
        ...previousViews.filter(
          (view) => getViewContextKey(view) !== activeViewKey,
        ),
      ].slice(0, MAX_RECENT_VIEWS);
    });
  }, [isReady, visibleViews]);

  useEffect(() => {
    if (!app || !isReady || visibleViews.length === 0) {
      return;
    }

    app
      .updateModelContext({
        content: [
          {
            type: "text",
            text: getModelContextMarkdown({ recentViews, visibleViews }),
          },
        ],
        structuredContent: {
          event: "metabase-visible-views-changed",
          activeDrillCard: drilledCard
            ? {
                name: drilledCard.name,
                display: drilledCard.display,
                dataset_query: drilledCard.dataset_query,
                visualization_settings: drilledCard.visualization_settings,
              }
            : undefined,
          activeViewRole: drilledCard ? "drill" : "main",
          maxRecentViews: MAX_RECENT_VIEWS,
          recentViews,
          visibleViews,
          ambiguityPolicy:
            "If multiple visible or recent Metabase views could match the user's wording, ask which chart/view they mean before constructing a query.",
        },
      })
      .catch(() => {
        // The visual prototype should still work if the host declines context updates.
      });
  }, [app, drilledCard, isReady, recentViews, visibleViews]);

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
