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
import { utf8_to_b64 } from "metabase/utils/encoding";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type { Card } from "metabase-types/api";

import { McpQueryBar } from "./McpQueryBar";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";
import {
  type McpStoredViewContextPayload,
  type McpViewContextPayload,
  type McpViewContextView,
  deleteMcpViewContext,
  storeMcpViewContext,
  touchMcpViewContext,
} from "./api";
import { useMcpApp } from "./hooks/useMcpApp";
import { useMcpUserAndSettingsFetch } from "./hooks/useMcpUserAndSettingsFetch";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

const store = getSdkStore();

const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const MAIN_QUESTION_HEIGHT = 500;
const DRILLED_QUESTION_HEIGHT = 220;
const DRILLED_QUESTION_TITLE_HEIGHT = 40;
const DRILLED_QUESTION_VERTICAL_SPACE = 24;
const MAX_RECENT_VIEWS = 5;
const VIEW_CONTEXT_HEARTBEAT_INTERVAL_MS = 10_000;
type DrillThroughHandler = NonNullable<SdkQuestionProps["onDrillThrough"]>;
type McpViewRole = "main" | "drill";
type McpViewContext = ReturnType<typeof getVisibleViewContext>;
type McpGlobalConfig = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId?: string;
};

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

function createViewInstanceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function hashStringToUuid(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
  }

  const hex = Math.abs(hash).toString(16).padStart(32, "0").slice(0, 32);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getToolCallViewInstanceId(hostContext: unknown) {
  const toolCallId = (hostContext as { toolInfo?: { id?: unknown } } | null)
    ?.toolInfo?.id;

  return toolCallId == null ? null : hashStringToUuid(String(toolCallId));
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

function getServerViewContext(view: McpViewContext): McpViewContextView {
  return {
    viewId: view.role,
    role: view.role,
    active: view.active,
    name: view.name,
    display: view.display,
    nextCard: view.drillCard,
    encodedQuery:
      view.role === "drill"
        ? utf8_to_b64(JSON.stringify(view.datasetQuery))
        : undefined,
  };
}

function getStoredLocalContext(
  context: McpViewContextPayload,
): McpStoredViewContextPayload {
  return {
    ...context,
    visibleViews: context.visibleViews.map(({ encodedQuery, ...view }) => view),
    recentViews: context.recentViews.map(({ encodedQuery, ...view }) => view),
  };
}

function isClaudeHost(hostVersion: { name?: string } | null | undefined) {
  return hostVersion?.name?.toLowerCase().includes("claude") ?? false;
}

function getContextLabel(context: McpStoredViewContextPayload) {
  const activeView =
    context.visibleViews.find((view) => view.active) ?? context.visibleViews[0];

  return `${activeView?.role ?? context.activeViewRole} view: ${
    activeView?.name ?? "unknown"
  } (${activeView?.display ?? "unknown"} visualization)`;
}

function getDrillNextCardSections(contexts: McpStoredViewContextPayload[]) {
  const drillViews = contexts.flatMap((context, contextIndex) =>
    context.visibleViews
      .filter((view) => view.role === "drill" && view.nextCard)
      .map((view, drillIndex) => ({
        label: `${contextIndex + 1}.${drillIndex + 1}. ${
          view.active ? "ACTIVE " : ""
        }${view.role} view from iframe ${context.viewInstanceId}: ${
          view.name
        } (${view.display ?? "unknown"} visualization)${
          view.query_handle ? `, query_handle: ${view.query_handle}` : ""
        }`,
        nextCard: view.nextCard,
      })),
  );

  if (drillViews.length === 0) {
    return "";
  }

  return `\n\nDrill nextCards for follow-up NLQ:
${drillViews
  .map(
    ({ label, nextCard }) => `${label}
\`\`\`json
${JSON.stringify(nextCard, null, 2)}
\`\`\``,
  )
  .join("\n\n")}`;
}

function getModelContextHint({
  contexts,
  maxRecentViews,
}: {
  contexts: McpStoredViewContextPayload[];
  maxRecentViews: number;
}) {
  return `---
event: metabase-view-context-available
context-count: ${contexts.length}
recent-view-limit: ${maxRecentViews}
---

The user is viewing Metabase MCP App visualizations. This widget context is the authoritative current Metabase context for follow-up natural language questions.

Active iframe contexts:
${contexts
  .map(
    (context, index) =>
      `${index + 1}. iframe ${context.viewInstanceId}: ${getContextLabel(
        context,
      )}`,
  )
  .join("\n")}

Visible views and drill handles:
${contexts
  .flatMap((context, contextIndex) =>
    context.visibleViews.map(
      (view, viewIndex) =>
        `${contextIndex + 1}.${viewIndex + 1}. ${
          view.active ? "ACTIVE " : ""
        }${view.role} view: ${view.name} (${
          view.display ?? "unknown"
        } visualization)${
          view.query_handle ? `, query_handle: ${view.query_handle}` : ""
        }`,
    ),
  )
  .join("\n")}${getDrillNextCardSections(contexts)}

Natural language query guidance:
- When the user says "this", "that", "the current view", "the drilled table", or "the drilled result", prefer the ACTIVE drill view if one exists.
- Use drill nextCards as the current analytical context when constructing follow-up queries from a drilled result.
- Pass query_handle to visualize_query when the user wants to show or continue from a drilled result.
- If multiple visible or recent views could match the user's wording, ask which chart/view they mean before constructing a query.`;
}

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, hostVersion, app } = useMcpApp();
  const [drilledCard, setDrilledCard] = useState<Card | null>(null);
  const [recentViews, setRecentViews] = useState<McpViewContext[]>([]);
  const fallbackViewInstanceId = useMemo(() => createViewInstanceId(), []);
  const viewInstanceId =
    getToolCallViewInstanceId(hostContext) ?? fallbackViewInstanceId;
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    instanceUrl = "",
    sessionToken = "",
    mcpSessionId = "",
  } = (window.metabaseConfig as McpGlobalConfig) ?? {};

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

  const updateWidgetContext = useCallback(
    (contexts: McpStoredViewContextPayload[]) => {
      app
        ?.updateModelContext({
          content: [
            {
              type: "text",
              text: getModelContextHint({
                contexts,
                maxRecentViews: MAX_RECENT_VIEWS,
              }),
            },
          ],
          structuredContent: {
            event: "metabase-view-context-available",
            contexts,
            contextCount: contexts.length,
            maxRecentViews: MAX_RECENT_VIEWS,
            ambiguityPolicy:
              "Use active drill query_handle values for follow-up NLQ about visible Metabase views. Ask which chart/view the user means when context is ambiguous.",
          },
        })
        .catch(() => {
          // The visual prototype should still work if the host declines context updates.
        });
    },
    [app],
  );

  useEffect(() => {
    if (!app || !isReady || visibleViews.length === 0) {
      return;
    }

    const context: McpViewContextPayload = {
      viewInstanceId,
      activeViewRole: drilledCard ? "drill" : "main",
      visibleViews: visibleViews.map(getServerViewContext),
      recentViews: recentViews.map(getServerViewContext),
    };

    if (mcpSessionId) {
      storeMcpViewContext({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        context,
      })
        .then(({ context, contexts }) => {
          updateWidgetContext(isClaudeHost(hostVersion) ? contexts : [context]);
        })
        .catch(() => {
          updateWidgetContext([getStoredLocalContext(context)]);
          // Keep the visual prototype working even if the server-side context write fails.
        });
    } else {
      updateWidgetContext([getStoredLocalContext(context)]);
    }
  }, [
    app,
    drilledCard,
    hostVersion,
    instanceUrl,
    isReady,
    mcpSessionId,
    recentViews,
    sessionToken,
    updateWidgetContext,
    viewInstanceId,
    visibleViews,
  ]);

  useEffect(() => {
    if (!app || !isReady || !instanceUrl || !sessionToken || !mcpSessionId) {
      return;
    }

    const interval = window.setInterval(() => {
      touchMcpViewContext({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        viewInstanceId,
      })
        .then(({ contexts }) => {
          updateWidgetContext(
            isClaudeHost(hostVersion) ? contexts : contexts.slice(0, 1),
          );
        })
        .catch(() => {
          // The visual prototype should still work if the heartbeat fails.
        });
    }, VIEW_CONTEXT_HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    app,
    hostVersion,
    instanceUrl,
    isReady,
    mcpSessionId,
    sessionToken,
    updateWidgetContext,
    viewInstanceId,
  ]);

  useEffect(() => {
    if (!app || !instanceUrl || !sessionToken || !mcpSessionId) {
      return;
    }

    app.onteardown = async () => {
      await deleteMcpViewContext({
        instanceUrl,
        sessionToken,
        mcpSessionId,
        viewInstanceId,
      });

      return {};
    };
  }, [app, instanceUrl, mcpSessionId, sessionToken, viewInstanceId]);

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
        ? DRILLED_QUESTION_HEIGHT +
          DRILLED_QUESTION_TITLE_HEIGHT +
          DRILLED_QUESTION_VERTICAL_SPACE
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
              <Box px="lg" style={{ flexShrink: 0 }}>
                <McpQuestionTitle compact stripTemporalBucket={false} />
              </Box>

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
