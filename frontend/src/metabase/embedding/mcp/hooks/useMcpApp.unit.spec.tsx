import {
  type App,
  type McpUiHostContext,
  type McpUiToolInputNotification,
  type McpUiToolResultNotification,
  type UseAppOptions,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { act, renderHook, waitFor } from "@testing-library/react";

import { resolveMcpQuery } from "../api";

import { useMcpApp } from "./useMcpApp";

jest.mock("@modelcontextprotocol/ext-apps/react", () => ({
  applyDocumentTheme: jest.fn(),
  applyHostFonts: jest.fn(),
  applyHostStyleVariables: jest.fn(),
  useApp: jest.fn(),
}));

jest.mock("../api", () => ({
  resolveMcpQuery: jest.fn(),
}));

const HOST_CONTEXT: McpUiHostContext = { theme: "dark" };

describe("useMcpApp", () => {
  let onToolInput:
    | ((params: McpUiToolInputNotification["params"]) => void)
    | undefined;
  let onToolResult:
    | ((params: McpUiToolResultNotification["params"]) => void)
    | undefined;

  beforeEach(() => {
    let appCreated = false;
    onToolInput = undefined;
    onToolResult = undefined;
    jest.mocked(resolveMcpQuery).mockReset();
    // Unjustified type cast. FIXME
    (window as any).metabaseConfig = {
      instanceUrl: "https://metabase.example",
      uiCredential: "ui-credential",
      mcpSessionId: "mcp-session-id",
    };

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
        callback: (params: McpUiToolResultNotification["params"]) => void,
      ) {
        onToolResult = callback;
      },
    };
    // This mock implements only the App methods and handlers used by the hook.
    const app = appLike as unknown as App;

    jest.mocked(useApp).mockImplementation((options: UseAppOptions) => {
      if (!appCreated) {
        appCreated = true;
        options.onAppCreated?.(app);
      }

      return { app, error: null, isConnected: true };
    });
  });

  afterEach(() => {
    // Unjustified type cast. FIXME
    delete (window as any).metabaseConfig;
    jest.restoreAllMocks();
  });

  it("uses structured content from a compliant host", () => {
    const { result } = renderHook(() => useMcpApp());

    act(() => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });
      onToolResult?.({
        content: [],
        structuredContent: { query: "encoded-query", prompt: "show orders" },
      });
    });

    expect(result.current.query).toBe("encoded-query");
    expect(result.current.prompt).toBe("show orders");
    expect(resolveMcpQuery).not.toHaveBeenCalled();
  });

  it("resolves the input handle when a host strips structured content", async () => {
    jest.mocked(resolveMcpQuery).mockResolvedValue({
      query: "encoded-query",
      prompt: "show orders",
    });
    const { result } = renderHook(() => useMcpApp());

    act(() => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });
      onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.query).toBe("encoded-query");
    });
    expect(result.current.prompt).toBe("show orders");
    expect(resolveMcpQuery).toHaveBeenCalledWith({
      instanceUrl: "https://metabase.example",
      uiCredential: "ui-credential",
      mcpSessionId: "mcp-session-id",
      queryHandle: "query-handle",
    });
  });

  it("uses the original tool error without retrying the handle", () => {
    const { result } = renderHook(() => useMcpApp());

    act(() => {
      onToolInput?.({ arguments: { query_handle: "missing-handle" } });
      onToolResult?.({
        content: [{ type: "text", text: "Query handle not found." }],
        isError: true,
      });
    });

    expect(result.current.error?.message).toBe("Query handle not found.");
    expect(resolveMcpQuery).not.toHaveBeenCalled();
  });

  it("exposes an error when the handle fallback fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest
      .mocked(resolveMcpQuery)
      .mockRejectedValue(new Error("Query handle unavailable"));
    const { result } = renderHook(() => useMcpApp());

    act(() => {
      onToolInput?.({ arguments: { query_handle: "query-handle" } });
      onToolResult?.({ content: [], isError: false });
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Query handle unavailable");
    });
  });
});
