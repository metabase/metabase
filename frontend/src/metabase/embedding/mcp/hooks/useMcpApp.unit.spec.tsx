import {
  type App,
  type McpUiHostContext,
  type McpUiToolInputNotification,
  type McpUiToolResultNotification,
  type UseAppOptions,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { act, renderHook, waitFor } from "@testing-library/react";

import { resolveMcpQueryHandle } from "../api";

import { useMcpApp } from "./useMcpApp";

jest.mock("@modelcontextprotocol/ext-apps/react", () => ({
  applyDocumentTheme: jest.fn(),
  applyHostFonts: jest.fn(),
  applyHostStyleVariables: jest.fn(),
  useApp: jest.fn(),
}));

jest.mock("../api", () => ({ resolveMcpQueryHandle: jest.fn() }));

const HOST_CONTEXT: McpUiHostContext = { theme: "dark" };

type McpTestWindow = Window & {
  metabaseConfig?: {
    instanceUrl: string;
    uiCredential: string;
    mcpSessionId: string;
  };
};

// The shared window.metabaseConfig type does not include fields injected by MCP Apps.
const mcpTestWindow = window as McpTestWindow;

describe("useMcpApp", () => {
  let onToolInput:
    | ((params: McpUiToolInputNotification["params"]) => void)
    | undefined;

  let onToolResult:
    | ((params: McpUiToolResultNotification["params"]) => unknown)
    | undefined;

  function createMockMcpApp(): App {
    const appLike = {
      getHostContext: () => HOST_CONTEXT,

      set onhostcontextchanged(
        _callback: (context: McpUiHostContext) => void,
      ) {},

      set ontoolinput(
        callback: (params: McpUiToolInputNotification["params"]) => void,
      ) {
        onToolInput = callback;
      },

      set ontoolresult(
        callback: (params: McpUiToolResultNotification["params"]) => unknown,
      ) {
        onToolResult = callback;
      },
    };

    // Mocks the MCP app methods and handlers
    return appLike as unknown as App;
  }

  beforeEach(() => {
    let appCreated = false;
    onToolInput = undefined;
    onToolResult = undefined;

    jest.mocked(resolveMcpQueryHandle).mockReset();

    mcpTestWindow.metabaseConfig = {
      instanceUrl: "https://metabase.example",
      uiCredential: "ui-credential",
      mcpSessionId: "mcp-session-id",
    };

    const app = createMockMcpApp();

    jest.mocked(useApp).mockImplementation((options: UseAppOptions) => {
      if (!appCreated) {
        appCreated = true;
        options.onAppCreated?.(app);
      }

      return { app, error: null, isConnected: true };
    });
  });

  afterEach(() => {
    delete mcpTestWindow.metabaseConfig;

    jest.restoreAllMocks();
  });

  it("uses structured content when MCP host supports it", async () => {
    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });

      await onToolResult?.({
        content: [],
        structuredContent: { query: "encoded-query", prompt: "show orders" },
      });
    });

    expect(result.current.query).toBe("encoded-query");
    expect(result.current.prompt).toBe("show orders");
    expect(resolveMcpQueryHandle).not.toHaveBeenCalled();
  });

  it("resolves query handle on frontend when MCP host strips structuredContent", async () => {
    jest.mocked(resolveMcpQueryHandle).mockResolvedValue({
      query: "encoded-query",
      prompt: "show orders",
    });

    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });

      await onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.query).toBe("encoded-query");
    });

    expect(result.current.prompt).toBe("show orders");

    expect(resolveMcpQueryHandle).toHaveBeenCalledWith({
      instanceUrl: "https://metabase.example",
      uiCredential: "ui-credential",
      mcpSessionId: "mcp-session-id",
      queryHandle: "query-handle",
    });
  });

  it("preserves inline queries when MCP host strips structuredContent", async () => {
    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      onToolInput?.({ arguments: { query: "encoded-query" } });

      await onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.query).toBe("encoded-query");
    });

    expect(result.current.error).toBeNull();
    expect(resolveMcpQueryHandle).not.toHaveBeenCalled();
  });

  it("shows an error when tool input is missed and structuredContent is absent", async () => {
    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      await onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Query cannot be resolved.");
    });

    expect(resolveMcpQueryHandle).not.toHaveBeenCalled();
  });

  it("shows the original tool call error", async () => {
    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      onToolInput?.({ arguments: { query_handle: "missing-handle" } });

      await onToolResult?.({
        content: [{ type: "text", text: "Query handle not found." }],
        isError: true,
      });
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Query handle not found.");
    });

    expect(resolveMcpQueryHandle).not.toHaveBeenCalled();
  });

  it("shows an error when resolving query handle on the frontend fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    jest
      .mocked(resolveMcpQueryHandle)
      .mockRejectedValue(new Error("Query handle unavailable"));

    const { result } = renderHook(() => useMcpApp());

    await act(async () => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });

      await onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Query handle unavailable");
    });
  });
});
