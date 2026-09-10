import type {
  App,
  McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps/react";
import { act, renderHook, waitFor } from "@testing-library/react";

import { MCP_APPS_METADATA_KEY } from "../constants";

import { useMcpApp } from "./useMcpApp";

const mockUseApp = jest.fn();

interface TestMcpApp {
  callServerTool: jest.MockedFunction<App["callServerTool"]>;
  getHostCapabilities: jest.MockedFunction<App["getHostCapabilities"]>;
  getHostContext: jest.MockedFunction<App["getHostContext"]>;
  getHostVersion: jest.MockedFunction<App["getHostVersion"]>;

  ontoolresult: (params: McpUiToolResultNotification["params"]) => void;
}

const QUERY_RESULT: McpUiToolResultNotification["params"] = {
  content: [],
  structuredContent: { query: "encoded-query" },
};

const NEXT_QUERY_RESULT: McpUiToolResultNotification["params"] = {
  content: [],
  structuredContent: { query: "next-encoded-query" },
};

const createAuthResult = (
  credential = "refreshed-credential",
  sessionId = "mcp-session-id",
): Awaited<ReturnType<App["callServerTool"]>> => ({
  content: [],
  _meta: {
    [MCP_APPS_METADATA_KEY]: { credential, sessionId },
  },
});

const createTestApp = (overrides: Partial<TestMcpApp> = {}): TestMcpApp => ({
  callServerTool: jest.fn(),
  getHostCapabilities: jest.fn(() => ({})),
  getHostContext: jest.fn(() => undefined),
  getHostVersion: jest.fn(() => undefined),
  ontoolresult: jest.fn(),
  ...overrides,
});

const setup = (overrides: Partial<TestMcpApp> = {}) => {
  const app = createTestApp(overrides);
  let appCreated = false;

  mockUseApp.mockImplementation(({ onAppCreated }) => {
    if (!appCreated) {
      appCreated = true;
      onAppCreated(app);
    }

    return { app };
  });

  return { app, ...renderHook(() => useMcpApp()) };
};

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

  it("gets auth from the server tool instead of the visualization result", async () => {
    const { app, result } = setup({
      callServerTool: jest.fn().mockResolvedValue(createAuthResult()),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    act(() => {
      app.ontoolresult({
        ...QUERY_RESULT,
        _meta: {
          [MCP_APPS_METADATA_KEY]: {
            credential: "tool-result-credential",
            sessionId: "tool-result-session-id",
          },
        },
      });
    });

    await waitFor(() => {
      expect(app.callServerTool).toHaveBeenCalledWith(
        {
          name: "refresh_ui_credential",
          arguments: {},
        },
        {
          signal: expect.any(AbortSignal),
          timeout: 10 * 1000,
        },
      );

      expect(result.current.query).toBe("encoded-query");
      expect(result.current.uiCredential).toBe("refreshed-credential");
      expect(result.current.mcpSessionId).toBe("mcp-session-id");
    });
  });

  it("reports an unsupported host when server tools are unavailable", () => {
    // callServerTool is unavailable here
    const { app, result } = setup({
      getHostVersion: jest.fn(() => ({
        name: "Codex Desktop",
        version: "1.0.0",
      })),
    });

    act(() => app.ontoolresult(QUERY_RESULT));

    expect(result.current.hostError).toBe(
      "Codex Desktop does not support query visualization.",
    );
  });

  it("gets fresh auth when the host reuses the same query", async () => {
    const { app } = setup({
      callServerTool: jest.fn().mockResolvedValue(createAuthResult()),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(app.callServerTool).toHaveBeenCalledTimes(1);
    const firstSignal = app.callServerTool.mock.calls[0][1]?.signal;

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(app.callServerTool).toHaveBeenCalledTimes(2);
    const secondSignal = app.callServerTool.mock.calls[1][1]?.signal;

    expect(firstSignal).not.toBe(secondSignal);
    expect(firstSignal?.aborted).toBe(false);
  });

  it("keeps the previous query and auth while a new tool result authenticates", async () => {
    let resolveRefresh!: (result: ReturnType<typeof createAuthResult>) => void;
    const pendingRefresh = new Promise<ReturnType<typeof createAuthResult>>(
      (resolve) => {
        resolveRefresh = resolve;
      },
    );
    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockResolvedValueOnce(
          createAuthResult("initial-credential", "initial-session-id"),
        )
        .mockReturnValueOnce(pendingRefresh),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.uiCredential).toBe("initial-credential");
    expect(result.current.mcpSessionId).toBe("initial-session-id");
    expect(result.current.query).toBe("encoded-query");

    act(() => app.ontoolresult(NEXT_QUERY_RESULT));
    expect(result.current.uiCredential).toBe("initial-credential");
    expect(result.current.mcpSessionId).toBe("initial-session-id");
    expect(result.current.query).toBe("encoded-query");

    await act(async () => {
      resolveRefresh(createAuthResult("next-credential", "next-session-id"));
      await pendingRefresh;
    });
    expect(result.current.uiCredential).toBe("next-credential");
    expect(result.current.mcpSessionId).toBe("next-session-id");
    expect(result.current.query).toBe("next-encoded-query");
  });

  it("aborts an in-flight auth request when a newer tool result arrives", async () => {
    let resolveFirstRefresh!: (
      result: ReturnType<typeof createAuthResult>,
    ) => void;
    const firstRefresh = new Promise<ReturnType<typeof createAuthResult>>(
      (resolve) => {
        resolveFirstRefresh = resolve;
      },
    );
    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockReturnValueOnce(firstRefresh)
        .mockResolvedValueOnce(
          createAuthResult("next-credential", "next-session-id"),
        ),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    act(() => app.ontoolresult(QUERY_RESULT));
    const firstSignal = app.callServerTool.mock.calls[0][1]?.signal;

    await act(async () => app.ontoolresult(NEXT_QUERY_RESULT));

    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.query).toBe("next-encoded-query");
    expect(result.current.uiCredential).toBe("next-credential");

    await act(async () => {
      resolveFirstRefresh(
        createAuthResult("stale-credential", "stale-session-id"),
      );
      await firstRefresh;
    });

    expect(result.current.query).toBe("next-encoded-query");
    expect(result.current.uiCredential).toBe("next-credential");
  });

  it("reports an error after two initial credential refresh failures", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    const { app, result } = setup({
      callServerTool: jest.fn().mockRejectedValue(new Error("Refresh failed")),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.hostError).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(2);

    expect(result.current.hostError).toBe(
      "This visualization did not load. Ask your MCP client to show it again.",
    );
  });

  it("keeps retrying after background credential refresh failures", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockResolvedValueOnce(createAuthResult("initial-credential"))
        .mockRejectedValueOnce(new Error("Refresh failed"))
        .mockRejectedValueOnce(new Error("Refresh failed"))
        .mockResolvedValueOnce(createAuthResult("recovered-credential")),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.uiCredential).toBe("initial-credential");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3 * 60 * 1000);
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(3);
    expect(result.current.hostError).toBeNull();
    expect(result.current.uiCredential).toBe("initial-credential");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(4);
    expect(result.current.hostError).toBeNull();
    expect(result.current.uiCredential).toBe("recovered-credential");
  });

  it("keeps retrying when auth refresh fails for a repeated tool result", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockResolvedValueOnce(createAuthResult("initial-credential"))
        .mockRejectedValueOnce(new Error("Refresh failed"))
        .mockRejectedValueOnce(new Error("Refresh failed"))
        .mockResolvedValueOnce(createAuthResult("recovered-credential")),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.uiCredential).toBe("initial-credential");

    await act(async () => app.ontoolresult(QUERY_RESULT));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(3);
    expect(result.current.hostError).toBeNull();
    expect(result.current.uiCredential).toBe("initial-credential");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });

    expect(app.callServerTool).toHaveBeenCalledTimes(4);
    expect(result.current.hostError).toBeNull();
    expect(result.current.uiCredential).toBe("recovered-credential");
  });

  it("does not reuse expired auth for a repeated tool result", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockResolvedValueOnce(createAuthResult("initial-credential"))
        .mockRejectedValue(new Error("Refresh failed")),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.uiCredential).toBe("initial-credential");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(4.5 * 60 * 1000);
    });
    expect(result.current.uiCredential).toBe("");
    expect(result.current.mcpSessionId).toBe("");

    await act(async () => app.ontoolresult(QUERY_RESULT));
    expect(result.current.uiCredential).toBe("");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 1000);
    });
    expect(result.current.hostError).toBe(
      "This visualization did not load. Ask your MCP client to show it again.",
    );
  });

  it("measures credential validity from the successful request start", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();

    let resolveRefresh!: (result: ReturnType<typeof createAuthResult>) => void;
    const delayedRefresh = new Promise<ReturnType<typeof createAuthResult>>(
      (resolve) => {
        resolveRefresh = resolve;
      },
    );
    const { app, result } = setup({
      callServerTool: jest
        .fn()
        .mockReturnValueOnce(delayedRefresh)
        .mockRejectedValue(new Error("Refresh failed")),
      getHostCapabilities: jest.fn(() => ({ serverTools: {} })),
    });

    act(() => app.ontoolresult(QUERY_RESULT));
    expect(app.callServerTool).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60 * 1000);
      resolveRefresh(createAuthResult("delayed-credential"));
      await delayedRefresh;
    });
    expect(result.current.uiCredential).toBe("delayed-credential");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3.5 * 60 * 1000);
    });
    expect(result.current.uiCredential).toBe("");
    expect(result.current.mcpSessionId).toBe("");
  });
});
