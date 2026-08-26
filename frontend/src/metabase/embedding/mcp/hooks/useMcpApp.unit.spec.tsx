import { act, renderHook, waitFor } from "@testing-library/react";

import { useMcpApp } from "./useMcpApp";

const mockUseApp = jest.fn();

jest.mock("@modelcontextprotocol/ext-apps/react", () => ({
  applyDocumentTheme: jest.fn(),
  applyHostFonts: jest.fn(),
  applyHostStyleVariables: jest.fn(),
  useApp: (...args: unknown[]) => mockUseApp(...args),
}));

describe("useMcpApp", () => {
  afterEach(() => {
    jest.useRealTimers();
    mockUseApp.mockReset();
  });

  it("falls back to tool-result auth when the host cannot call server tools", async () => {
    const app: Record<string, any> = {
      getHostContext: jest.fn(() => null),
      getHostCapabilities: jest.fn(() => ({})),
    };
    let appCreated = false;

    mockUseApp.mockImplementation(({ onAppCreated }) => {
      if (!appCreated) {
        appCreated = true;
        onAppCreated(app);
      }

      return { app };
    });

    const { result } = renderHook(() => useMcpApp());

    act(() => {
      app.ontoolresult({ structuredContent: { query: "ignored-query" } });
    });

    expect(result.current.query).toBe("ignored-query");
    expect(result.current.uiCredential).toBe("");
    expect(result.current.mcpSessionId).toBe("");

    act(() => {
      app.ontoolresult({
        structuredContent: { query: "encoded-query" },
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "fresh-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "mcp-session-id",
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.query).toBe("encoded-query");
      expect(result.current.uiCredential).toBe("fresh-credential");
      expect(result.current.mcpSessionId).toBe("mcp-session-id");
    });
  });

  it("refreshes expired tool-result auth through the server on startup", async () => {
    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "new-mcp-session-id",
          },
        },
      }),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
      getHostContext: jest.fn(() => null),
    };
    let appCreated = false;

    mockUseApp.mockImplementation(({ onAppCreated }) => {
      if (!appCreated) {
        appCreated = true;
        onAppCreated(app);
      }

      return { app };
    });

    const { result } = renderHook(() => useMcpApp());

    act(() => {
      app.ontoolresult({
        structuredContent: { query: "encoded-query" },
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "expired-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "old-mcp-session-id",
          },
        },
      });
    });

    await waitFor(() => {
      expect(app.callServerTool).toHaveBeenCalledWith({
        name: "refresh_visualize_query_ui_credential",
        arguments: {},
      });
      expect(result.current.uiCredential).toBe("refreshed-credential");
      expect(result.current.mcpSessionId).toBe("new-mcp-session-id");
    });
  });

  it("refreshes auth when a restored tool result omits private metadata", async () => {
    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "new-mcp-session-id",
          },
        },
      }),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
      getHostContext: jest.fn(() => null),
    };
    let appCreated = false;

    mockUseApp.mockImplementation(({ onAppCreated }) => {
      if (!appCreated) {
        appCreated = true;
        onAppCreated(app);
      }

      return { app };
    });

    const { result } = renderHook(() =>
      useMcpApp("refresh_visualize_query_ui_credential"),
    );

    act(() => {
      app.ontoolresult({ structuredContent: { query: "encoded-query" } });
    });

    await waitFor(() => {
      expect(app.callServerTool).toHaveBeenCalledWith({
        name: "refresh_visualize_query_ui_credential",
        arguments: {},
      });
      expect(result.current.query).toBe("encoded-query");
      expect(result.current.uiCredential).toBe("refreshed-credential");
      expect(result.current.mcpSessionId).toBe("new-mcp-session-id");
    });
  });

  it("refreshes auth periodically while the iframe remains open", async () => {
    jest.useFakeTimers();

    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "mcp-session-id",
          },
        },
      }),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
      getHostContext: jest.fn(() => null),
    };
    let appCreated = false;

    mockUseApp.mockImplementation(({ onAppCreated }) => {
      if (!appCreated) {
        appCreated = true;
        onAppCreated(app);
      }

      return { app };
    });

    renderHook(() => useMcpApp());

    await act(async () => {
      app.ontoolresult({
        structuredContent: { query: "encoded-query" },
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "bootstrap-credential",
            refreshTool: "refresh_visualize_query_ui_credential",
            sessionId: "mcp-session-id",
          },
        },
      });
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(2);
  });
});
