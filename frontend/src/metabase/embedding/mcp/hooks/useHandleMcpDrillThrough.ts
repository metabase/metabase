import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useCallback } from "react";

import { utf8_to_b64 } from "metabase/utils/encoding";
import type { Card } from "metabase-types/api";

import { storeDrillQuery } from "../api";

interface McpGlobalConfig {
  instanceUrl?: string;
  sessionToken?: string;
  mcpSessionId?: string;
}

// Drills that refine the current visualization without changing what it is.
// The chart's conceptual title stays the same — zoom, granularity, ordering.
// Match by prefix, e.g. "sort" matches both "sort.ascending" and "sort.descending".
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

type DrillThroughHandler = (
  params: { drillName?: string; nextCard: Card },
  defaultNavigate: () => Promise<void>,
) => Promise<void>;

export function useHandleMcpDrillThrough(app: App | null): DrillThroughHandler {
  return useCallback(
    async ({ drillName, nextCard }, defaultNavigate) => {
      if (isStayDrill(drillName)) {
        await defaultNavigate();
      } else if (app) {
        const encodedQuery = utf8_to_b64(
          JSON.stringify(nextCard.dataset_query),
        );

        const { instanceUrl, sessionToken, mcpSessionId } =
          (window.metabaseConfig as McpGlobalConfig | undefined) ?? {};

        if (!instanceUrl || !sessionToken || !mcpSessionId) {
          return;
        }

        try {
          // Store the card server-side in the MCP session. This is universal —
          // works in all MCP clients (Claude Desktop, Cursor, VS Code).
          // The render_drill_through tool will consume it with no LLM-visible payload.
          await storeDrillQuery({
            instanceUrl,
            sessionToken,
            mcpSessionId,
            encodedQuery,
          });

          // Uses the same term as the tool description ("show a drill-through result")
          // so the LLM always calls render_drill_through.
          await app.sendMessage({
            role: "user",
            content: [
              {
                type: "text",
                text: "Show me the drill-through result.",
              },
            ],
          });
        } catch {
          // do not trigger the prompt if storing drills query fails
        }
      }
    },
    [app],
  );
}
