/* eslint-disable metabase/no-literal-metabase-strings -- no whitelabel in mcp */
import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { b64_to_utf8, utf8_to_b64 } from "metabase/utils/encoding";
import type { Card } from "metabase-types/api";

import { McpQueryBar } from "./McpQueryBar";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { useMcpApp } from "./hooks/useMcpApp";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

/**
 * Configuration exposed via window.metabaseConfig
 **/
interface McpGlobalConfig {
  instanceUrl?: string;
  sessionToken?: string;
}

/**
 * Store a base64-encoded query via PATCH /api/mcp/ui/drills.
 * The render_drill_through tool will consume it when the LLM calls it.
 * This is universal — works in all MCP clients (Claude Desktop, Cursor, VS Code).
 */
async function storePendingCard(encodedQuery: string): Promise<void> {
  const { instanceUrl, sessionToken } =
    (window.metabaseConfig as McpGlobalConfig | undefined) ?? {};

  const response = await fetch(`${instanceUrl}/api/mcp/ui/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Session": sessionToken ?? "",
    },
    body: JSON.stringify({ encodedQuery }),
  });

  if (!response.ok) {
    throw new Error(
      `storePendingCard failed: ${response.status} ${response.statusText}`,
    );
  }
}

// Drills that refine the current visualization without changing what it IS.
// The chart's conceptual "title" stays the same — zoom, granularity, ordering.
// Prefix-matched: e.g. "sort" matches both "sort.ascending" and "sort.descending".
const STAY_DRILL_PREFIXES = [
  "zoom",
  "zoom-in.binning",
  "zoom-in.timeseries",
  "zoom-in.geographic",
  "sort",
];

const isStayDrill = (drillName: string | undefined) =>
  drillName != null &&
  STAY_DRILL_PREFIXES.some(
    (prefix) => drillName === prefix || drillName.startsWith(`${prefix}.`),
  );

const store = getSdkStore();

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, app } = useMcpApp();

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
    display: "flex",
    flexDirection: "column",

    padding: "5px 0px 0px 10px",

    // Apply safe area insets from the host environment, with extra top padding.
    margin: `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`,
  };

  if (!isReady) {
    return null;
  }

  const onDrillThrough: NonNullable<
    React.ComponentProps<typeof SdkQuestion>["onDrillThrough"]
  > = async ({ drillName, nextCard }, defaultNavigate) => {
    // eslint-disable-next-line no-console
    console.log("[MCP] onDrillThrough", { drillName, app: !!app });

    if (isStayDrill(drillName)) {
      // eslint-disable-next-line no-console
      console.log("[MCP] STAY drill — navigating in place");

      await defaultNavigate();
    } else if (app) {
      try {
        const encodedQuery = utf8_to_b64(
          JSON.stringify(nextCard.dataset_query),
        );

        // Store the card server-side in the MCP session. This is universal —
        // works in all MCP clients (Claude Desktop, Cursor, VS Code).
        // The render_drill_through tool will consume it with no LLM-visible payload.
        try {
          await storePendingCard(encodedQuery);
          // eslint-disable-next-line no-console
          console.log("[MCP] stored pending card for render_drill_through");
        } catch (e) {
          console.error("[MCP] storePendingCard error", e);
        }

        // Phrasing mirrors the tool description ("show a drill-through result")
        // so the LLM reliably calls render_drill_through without added context.
        await app.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: "Show me the drill-through result.",
            },
          ],
        });
      } catch (e) {
        console.error("[MCP] sendMessage error", e);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[MCP] GO drill — no app instance (dev mode)");
    }
  };

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
          onDrillThrough={onDrillThrough}
        >
          {/* Minimal title: "Sum of Total by Created At" (no temporal bucket suffix) */}
          <McpQuestionTitle />

          {/* Visualization fills the remaining space */}
          <Flex flex={1} mih={0} style={{ overflow: "hidden" }}>
            <SdkQuestion.QuestionVisualization height="calc(500px - 7rem)" />
          </Flex>

          {/* Metric-viewer-style query bar: chart type + time granularity */}
          <Flex justify="center" py="xs" style={{ flexShrink: 0 }}>
            <McpQueryBar />
          </Flex>
        </SdkQuestion>
      </div>
    </ComponentProvider>
  );
}
