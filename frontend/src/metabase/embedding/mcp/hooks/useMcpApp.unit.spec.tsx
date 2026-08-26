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
    jest.restoreAllMocks();
    mockUseApp.mockReset();
  });

  it("does not use credentials from the visualization tool result", () => {
    const app: Record<string, any> = {
      getHostContext: jest.fn(() => null),
      getHostCapabilities: jest.fn(() => ({})),
      getHostVersion: jest.fn(() => undefined),
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
      app.ontoolresult({
        structuredContent: { query: "encoded-query" },
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "tool-result-credential",
            sessionId: "mcp-session-id",
          },
        },
      });
    });

    expect(result.current.query).toBe("encoded-query");
    expect(result.current.uiCredential).toBe("");
    expect(result.current.mcpSessionId).toBe("");
  });

  it("reports an unsupported host when server tools are unavailable", () => {
    const app: Record<string, any> = {
      getHostCapabilities: jest.fn(() => ({})),
      getHostContext: jest.fn(() => null),
      getHostVersion: jest.fn(() => ({
        name: "Claude Desktop",
        version: "1.0.0",
      })),
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

    expect(result.current.hostError).toBe(
      "Claude Desktop does not support this visualization.",
    );
  });

  it("uses a generic name when the unsupported host has no name", () => {
    const app: Record<string, any> = {
      getHostCapabilities: jest.fn(() => ({})),
      getHostContext: jest.fn(() => null),
      getHostVersion: jest.fn(() => undefined),
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

    expect(result.current.hostError).toBe(
      "Your MCP client does not support this visualization.",
    );
  });

  it("gets auth from the server tool when the visualization loads", async () => {
    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
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

  it("gets fresh auth when the host reuses the same query", async () => {
    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
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

    renderHook(() => useMcpApp("refresh_visualize_query_ui_credential"));

    await act(async () => {
      app.ontoolresult({ structuredContent: { query: "encoded-query" } });
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(1);

    await act(async () => {
      app.ontoolresult({ structuredContent: { query: "encoded-query" } });
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(2);
  });

  it("reports an error after two consecutive credential refresh failures", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    const app: Record<string, any> = {
      callServerTool: jest.fn().mockRejectedValue(new Error("Refresh failed")),
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

    await act(async () => {
      app.ontoolresult({ structuredContent: { query: "encoded-query" } });
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(1);
    expect(result.current.hostError).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(2);

    expect(result.current.hostError).toBe(
      "This visualization did not load. Ask your MCP client to show it again.",
    );
  });

  it("refreshes auth periodically while the iframe remains open", async () => {
    jest.useFakeTimers();

    const app: Record<string, any> = {
      callServerTool: jest.fn().mockResolvedValue({
        _meta: {
          "com.metabase/mcp-apps": {
            credential: "refreshed-credential",
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

    renderHook(() => useMcpApp("refresh_visualize_query_ui_credential"));

    await act(async () => {
      app.ontoolresult({ structuredContent: { query: "encoded-query" } });
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(2);
  });
});
