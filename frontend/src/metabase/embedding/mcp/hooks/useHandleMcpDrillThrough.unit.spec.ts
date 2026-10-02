import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";

import * as Urls from "metabase/urls";
import { createMockCard } from "metabase-types/api/mocks";

import type { ApplyMcpOperations, McpDrillOperation } from "../derive";
import { setCurrentMcpQueryHandle } from "../requests";

import {
  useHandleMcpDrill,
  useHandleMcpDrillThrough,
} from "./useHandleMcpDrillThrough";

const NEXT_CARD = createMockCard({
  dataset_query: {
    type: "query",
    database: 1,
    query: { "source-table": 2 },
  },
});

const DRILL: McpDrillOperation = {
  type: "drill-thru",
  drill: "fk-details",
  context: { column: "PRODUCT_ID", value: 14 },
};

const STAY_DRILL: McpDrillOperation = {
  type: "drill-thru",
  drill: "sort",
  context: { column: "PRICE" },
  direction: "asc",
};

const createApp = (hostName: string) => ({
  getHostVersion: () => ({ name: hostName, version: "1.0.0" }),
  openLink: jest.fn(),
  sendMessage: jest.fn(),
});

function setupDrill(hostName: string) {
  const app = createApp(hostName);
  const applyOperations = jest.fn<
    ReturnType<ApplyMcpOperations>,
    Parameters<ApplyMcpOperations>
  >();
  const { result } = renderHook(() =>
    useHandleMcpDrill({
      app,
      uiCredential: "ui-credential",
      mcpSessionId: "mcp-session-id",
      applyOperationsRef: { current: applyOperations },
    }),
  );

  return { app, applyOperations, handleDrill: result.current };
}

const drillCalls = () =>
  fetchMock.callHistory.calls("path:/api/embed-mcp/drills");

describe("useHandleMcpDrill", () => {
  beforeEach(() => {
    window.metabaseConfig = { instanceUrl: "https://metabase.example" };
    setCurrentMcpQueryHandle("current-handle");

    fetchMock.post("path:/api/embed-mcp/drills", { handle: "drill-handle" });
  });

  afterEach(() => {
    delete window.metabaseConfig;
    setCurrentMcpQueryHandle(null);
  });

  it("applies a drill that refines the chart in place, through the server", async () => {
    const { app, applyOperations, handleDrill } = setupDrill("Cursor");

    await handleDrill(STAY_DRILL, NEXT_CARD);

    expect(applyOperations).toHaveBeenCalledWith([STAY_DRILL]);
    expect(drillCalls()).toHaveLength(0);
    expect(app.sendMessage).not.toHaveBeenCalled();
    expect(app.openLink).not.toHaveBeenCalled();
  });

  it("opens drill-through questions in Metabase for Claude", async () => {
    const { app, applyOperations, handleDrill } = setupDrill("Claude Desktop");

    await handleDrill(DRILL, NEXT_CARD);

    expect(app.openLink).toHaveBeenCalledWith({
      url: "https://metabase.example" + Urls.serializedQuestion(NEXT_CARD),
    });
    expect(drillCalls()).toHaveLength(0);
    expect(app.sendMessage).not.toHaveBeenCalled();
    expect(applyOperations).not.toHaveBeenCalled();
  });

  it("derives the drill from the current handle and sends the new handle for non-Claude hosts", async () => {
    const { app, handleDrill } = setupDrill("Cursor");

    await handleDrill(DRILL, NEXT_CARD);

    const [call] = drillCalls();
    expect(JSON.parse(String(call.options.body))).toEqual({
      handle: "current-handle",
      operation: DRILL,
    });

    expect(app.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [
        {
          type: "text",
          text: "Show me the result. Use handle drill-handle.",
        },
      ],
    });
    expect(app.openLink).not.toHaveBeenCalled();
  });

  it("opens the drill in Metabase when the server cannot derive it", async () => {
    fetchMock.removeRoutes();
    fetchMock.post("path:/api/embed-mcp/drills", 400);

    const { app, handleDrill } = setupDrill("Cursor");

    await handleDrill(DRILL, NEXT_CARD);

    expect(app.sendMessage).not.toHaveBeenCalled();
    expect(app.openLink).toHaveBeenCalledWith({
      url: "https://metabase.example" + Urls.serializedQuestion(NEXT_CARD),
    });
  });
});

describe("useHandleMcpDrillThrough", () => {
  beforeEach(() => {
    window.metabaseConfig = { instanceUrl: "https://metabase.example" };
  });

  afterEach(() => {
    delete window.metabaseConfig;
  });

  it("never runs a drill the server did not derive in the iframe: it opens in Metabase", async () => {
    const app = createApp("Cursor");
    const defaultNavigate = jest.fn();
    const { result } = renderHook(() => useHandleMcpDrillThrough({ app }));

    await result.current(
      { drillName: "column-filter", nextCard: NEXT_CARD },
      defaultNavigate,
    );

    expect(defaultNavigate).not.toHaveBeenCalled();
    expect(app.openLink).toHaveBeenCalledWith({
      url: "https://metabase.example" + Urls.serializedQuestion(NEXT_CARD),
    });
  });
});
