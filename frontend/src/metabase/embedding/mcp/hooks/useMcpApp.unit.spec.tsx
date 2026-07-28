import { renderHook, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { useMcpApp } from "./useMcpApp";

type ToolHandlers = {
  ontoolinput?: (params: { arguments?: unknown }) => void;
  ontoolresult?: (params: { structuredContent?: unknown }) => void;
};

const mockUseApp = jest.fn();

jest.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: (options: unknown) => mockUseApp(options),
  applyDocumentTheme: jest.fn(),
  applyHostFonts: jest.fn(),
  applyHostStyleVariables: jest.fn(),
}));

const ENCODED_QUERY = "eyJkYXRhYmFzZSI6MX0=";

/**
 * Renders the hook and hands back the tool-notification handlers it registered,
 * so a test can drive it the way an MCP host would.
 */
function setup() {
  const handlers: ToolHandlers = {};

  mockUseApp.mockImplementation((options: any) => {
    const app = {
      getHostContext: () => null,
      set ontoolinput(fn: ToolHandlers["ontoolinput"]) {
        handlers.ontoolinput = fn;
      },
      set ontoolresult(fn: ToolHandlers["ontoolresult"]) {
        handlers.ontoolresult = fn;
      },
      set onhostcontextchanged(_fn: unknown) {},
    };

    options.onAppCreated(app);

    return { app };
  });

  const { result } = renderHook(() => useMcpApp());

  return { result, handlers };
}

describe("useMcpApp", () => {
  beforeEach(() => {
    // Unjustified type cast. FIXME
    (window as any).metabaseConfig = {
      instanceUrl: "https://metabase.example",
      sessionToken: "session-token",
      mcpSessionId: "mcp-session-id",
    };
  });

  afterEach(() => {
    // Unjustified type cast. FIXME
    delete (window as any).metabaseConfig;
    mockUseApp.mockReset();
  });

  describe("v2 handle payloads (GHY-4157)", () => {
    it("exchanges a query_handle for the query so the model never carries it", async () => {
      fetchMock.get("path:/api/embed-mcp/queries/handle-1", {
        query: ENCODED_QUERY,
        prompt: "show me orders",
      });

      const { result, handlers } = setup();

      handlers.ontoolresult?.({
        structuredContent: { query_handle: "handle-1", display: "bar" },
      });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
      expect(result.current.prompt).toBe("show me orders");
      expect(result.current.display).toBe("bar");
    });

    it("resolves the handle from tool input too, so rendering starts before the tool returns", async () => {
      fetchMock.get("path:/api/embed-mcp/queries/handle-2", {
        query: ENCODED_QUERY,
        prompt: null,
      });

      const { result, handlers } = setup();

      handlers.ontoolinput?.({ arguments: { query_handle: "handle-2" } });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
      expect(result.current.prompt).toBeNull();
    });

    it("ignores a display it does not recognize rather than rendering a broken chart", async () => {
      fetchMock.get("path:/api/embed-mcp/queries/handle-3", {
        query: ENCODED_QUERY,
        prompt: null,
      });

      const { result, handlers } = setup();

      handlers.ontoolresult?.({
        structuredContent: { query_handle: "handle-3", display: "hologram" },
      });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
      expect(result.current.display).toBeNull();
    });
  });

  describe("v1 inline payloads", () => {
    it("renders an inline query without calling the callback API", async () => {
      const { result, handlers } = setup();

      handlers.ontoolresult?.({
        structuredContent: { query: ENCODED_QUERY, prompt: "show me orders" },
      });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
      expect(result.current.prompt).toBe("show me orders");
      expect(
        fetchMock.callHistory.calls(/\/api\/embed-mcp\/queries\//),
      ).toHaveLength(0);
    });

    it("renders an inline query from tool input", async () => {
      const { result, handlers } = setup();

      handlers.ontoolinput?.({ arguments: { query: ENCODED_QUERY } });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
    });
  });
});
