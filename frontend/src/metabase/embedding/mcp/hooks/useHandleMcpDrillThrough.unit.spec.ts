import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";

import * as Urls from "metabase/urls";
import { createMockCard } from "metabase-types/api/mocks";

import { useHandleMcpDrillThrough } from "./useHandleMcpDrillThrough";

const NEXT_CARD = createMockCard({
  dataset_query: {
    type: "query",
    database: 1,
    query: { "source-table": 2 },
  },
});

describe("useHandleMcpDrillThrough", () => {
  beforeEach(() => {
    (window as any).metabaseConfig = {
      instanceUrl: "https://metabase.example",
      sessionToken: "session-token",
      mcpSessionId: "mcp-session-id",
    };

    fetchMock.post("path:/api/embed-mcp/drills", { handle: "drill-handle" });
  });

  afterEach(() => {
    delete (window as any).metabaseConfig;
  });

  it("opens drill-through questions in Metabase for Claude", async () => {
    const app = {
      getHostVersion: () => ({ name: "Claude Desktop", version: "1.0.0" }),
      openLink: jest.fn(),
      sendMessage: jest.fn(),
    };

    const defaultNavigate = jest.fn();
    const { result } = renderHook(() => useHandleMcpDrillThrough(app as any));

    await result.current(
      { drillName: "fk-details", nextCard: NEXT_CARD },
      defaultNavigate,
    );

    expect(app.openLink).toHaveBeenCalledWith({
      url: "https://metabase.example" + Urls.serializedQuestion(NEXT_CARD),
    });

    // It should not do the drill operations: no saving queries, no inline navigation
    expect(
      fetchMock.callHistory.calls("path:/api/embed-mcp/drills"),
    ).toHaveLength(0);

    expect(app.sendMessage).not.toHaveBeenCalled();
    expect(defaultNavigate).not.toHaveBeenCalled();
  });

  it("stores drill queries and sends a render handle for non-Claude hosts", async () => {
    const app = {
      getHostVersion: () => ({ name: "Cursor", version: "1.0.0" }),
      openLink: jest.fn(),
      sendMessage: jest.fn(),
    };

    const defaultNavigate = jest.fn();
    const { result } = renderHook(() => useHandleMcpDrillThrough(app as any));

    await result.current(
      { drillName: "fk-details", nextCard: NEXT_CARD },
      defaultNavigate,
    );

    expect(
      fetchMock.callHistory.calls("path:/api/embed-mcp/drills"),
    ).toHaveLength(1);

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
    expect(defaultNavigate).not.toHaveBeenCalled();
  });
});
