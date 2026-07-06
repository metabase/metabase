import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useCallback } from "react";

import * as Urls from "metabase/urls";
import { utf8_to_b64 } from "metabase/utils/encoding";
import type * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { storeDrillQuery } from "../api";

interface McpGlobalConfig {
  instanceUrl?: string;
  sessionToken?: string;
  mcpSessionId?: string;
}

type DrillThruName<T extends Lib.DrillThruType = Lib.DrillThruType> =
  T extends `drill-thru/${infer Name}` ? Name : never;

// Drills that refine the current visualization without changing what it is.
// The chart's conceptual title stays the same — zoom, granularity, ordering.
// Match by prefix, e.g. "sort" matches both "sort.ascending" and "sort.descending".
const STAY_DRILL_PREFIXES = [
  "zoom",
  "zoom-in.binning",
  "zoom-in.timeseries",
  "zoom-in.geographic",
  "sort",
] as const satisfies readonly DrillThruName[];

const isStayDrill = (drillName: string | undefined) =>
  drillName != null &&
  STAY_DRILL_PREFIXES.some(
    (prefix) => drillName === prefix || drillName.startsWith(`${prefix}.`),
  );

const isClaudeHost = (app: App) => {
  const hostVersion = app.getHostVersion();

  return hostVersion?.name.toLowerCase().includes("claude");
};

type DrillThroughHandler = (
  params: { drillName?: string; nextCard: Card },
  defaultNavigate: () => Promise<void>,
) => Promise<void>;

export function useHandleMcpDrillThrough(app: App | null): DrillThroughHandler {
  return useCallback(
    async ({ drillName, nextCard }, defaultNavigate) => {
      if (isStayDrill(drillName) || !app) {
        await defaultNavigate();
        return;
      }

      const { instanceUrl, sessionToken, mcpSessionId } =
        (window.metabaseConfig as McpGlobalConfig | undefined) ?? {};

      if (isClaudeHost(app)) {
        if (!instanceUrl) {
          await defaultNavigate();
          return;
        }

        await app.openLink({
          url: instanceUrl + Urls.serializedQuestion(nextCard),
        });

        return;
      }

      if (!instanceUrl || !sessionToken || !mcpSessionId) {
        await defaultNavigate();
        return;
      }

      const encodedQuery = utf8_to_b64(JSON.stringify(nextCard.dataset_query));

      let handle: string;
      try {
        // Store the card server-side in the MCP session. This is universal —
        // works in all MCP clients (Claude Desktop, Cursor, VS Code).
        // The handle UUID is threaded into the agent message so render_drill_through
        // can fetch the payload without the LLM ever seeing it.
        ({ handle } = await storeDrillQuery({
          instanceUrl,
          sessionToken,
          mcpSessionId,
          encodedQuery,
        }));
      } catch {
        await defaultNavigate();
        return;
      }

      // Uses the same term as the tool description ("show the result")
      // so the LLM always calls render_drill_through, and includes the handle
      // it must pass through.
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Show me the result. Use handle ${handle}.`,
          },
        ],
      });
    },
    [app],
  );
}
