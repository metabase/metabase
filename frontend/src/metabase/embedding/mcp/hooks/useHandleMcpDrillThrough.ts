import type { App } from "@modelcontextprotocol/ext-apps/react";
import { type MutableRefObject, useCallback } from "react";

import * as Urls from "metabase/urls";
import type { SeriesCard } from "metabase-types/api";

import { storeDrillQuery } from "../api";
import {
  type ApplyMcpOperations,
  type McpDrillOperation,
  isStayDrill,
} from "../derive";
import { getCurrentMcpQueryHandle } from "../requests";

const getInstanceUrl = () => window.metabaseConfig?.instanceUrl;

const isClaudeHost = (app: Pick<App, "getHostVersion">) => {
  const hostVersion = app.getHostVersion();

  return hostVersion?.name.toLowerCase().includes("claude");
};

type McpDrillThroughApp = Pick<
  App,
  "getHostVersion" | "openLink" | "sendMessage"
>;

/**
 * Opens `nextCard` in Metabase, where the user's own session runs it. The
 * iframe never runs a query it built itself.
 */
async function openInMetabase(
  app: McpDrillThroughApp | null,
  nextCard: SeriesCard | null,
) {
  const instanceUrl = getInstanceUrl();

  if (!app || !instanceUrl || !nextCard) {
    console.error("This drill-through cannot be shown here.");
    return;
  }

  await app.openLink({ url: instanceUrl + Urls.serializedQuestion(nextCard) });
}

type DrillThroughHandler = (
  params: { drillName?: string; nextCard: SeriesCard },
  defaultNavigate: () => Promise<void>,
) => Promise<void>;

interface UseHandleMcpDrillThroughParams {
  app: McpDrillThroughApp | null;
}

/**
 * The SDK question's drill-through handler. Every drill the iframe supports is
 * derived on the server before it reaches here, so a drill that does reach
 * here is one the server cannot derive: it opens in Metabase instead of
 * running in the iframe.
 */
export function useHandleMcpDrillThrough({
  app,
}: UseHandleMcpDrillThroughParams): DrillThroughHandler {
  return useCallback(
    async ({ nextCard }) => {
      await openInMetabase(app, nextCard);
    },
    [app],
  );
}

interface UseHandleMcpDrillParams {
  app: McpDrillThroughApp | null;
  uiCredential: string;
  mcpSessionId: string;
  applyOperationsRef: MutableRefObject<ApplyMcpOperations | null>;
}

export type McpDrillHandler = (
  operation: McpDrillOperation,
  nextCard: SeriesCard | null,
) => Promise<void>;

/**
 * Handles a drill the server can derive. A drill that refines the current
 * chart is applied in place. Any other drill goes to the agent as a new
 * handle, or opens in Metabase for Claude hosts, which render the follow-up
 * there.
 */
export function useHandleMcpDrill({
  app,
  uiCredential,
  mcpSessionId,
  applyOperationsRef,
}: UseHandleMcpDrillParams): McpDrillHandler {
  return useCallback(
    async (operation, nextCard) => {
      if (isStayDrill(operation)) {
        applyOperationsRef.current?.([operation]);
        return;
      }

      if (!app || isClaudeHost(app)) {
        await openInMetabase(app, nextCard);
        return;
      }

      const instanceUrl = getInstanceUrl();
      const queryHandle = getCurrentMcpQueryHandle();

      if (!instanceUrl || !uiCredential || !mcpSessionId || !queryHandle) {
        await openInMetabase(app, nextCard);
        return;
      }

      let handle: string;
      try {
        // The server derives the drilled query from the stored handle, so the
        // handle threaded into the agent message holds only a server-built query.
        ({ handle } = await storeDrillQuery({
          instanceUrl,
          uiCredential,
          mcpSessionId,
          queryHandle,
          operation,
        }));
      } catch {
        await openInMetabase(app, nextCard);
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
    [app, applyOperationsRef, mcpSessionId, uiCredential],
  );
}
