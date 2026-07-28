import { renderHook, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getMcpQueryFetchErrorMessage } from "../utils/getMcpQueryFetchError";

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

  describe("handle resolution failures (GHY-4157)", () => {
    // A handle that can't be resolved leaves `query` null, and the route has no
    // other signal to render — without an error it sits on the loading
    // indicator forever.
    it("reports an expired handle rather than resolving to nothing", async () => {
      fetchMock.get("path:/api/embed-mcp/queries/reaped", 404);

      const { result, handlers } = setup();

      handlers.ontoolresult?.({
        structuredContent: { query_handle: "reaped" },
      });

      await waitFor(() =>
        expect(result.current.queryError).toBe(
          getMcpQueryFetchErrorMessage("expired"),
        ),
      );
      expect(result.current.query).toBeNull();
    });

    it("tells an expired embedding session apart from an unreachable instance", async () => {
      fetchMock.get("path:/api/embed-mcp/queries/stale", 401);

      const { result, handlers } = setup();

      handlers.ontoolresult?.({ structuredContent: { query_handle: "stale" } });

      await waitFor(() =>
        expect(result.current.queryError).toBe(
          getMcpQueryFetchErrorMessage("auth"),
        ),
      );
    });

    it("recovers when the tool result retries a handle the tool input could not resolve", async () => {
      // The host sends both notifications, so a transient failure on the first
      // must not leave a stale error over a visualization that did render.
      let attempts = 0;

      fetchMock.get("path:/api/embed-mcp/queries/flaky", () =>
        attempts++ === 0 ? 503 : { query: ENCODED_QUERY, prompt: null },
      );

      const { result, handlers } = setup();

      handlers.ontoolinput?.({ arguments: { query_handle: "flaky" } });

      await waitFor(() =>
        expect(result.current.queryError).toBe(
          getMcpQueryFetchErrorMessage("network"),
        ),
      );

      handlers.ontoolresult?.({ structuredContent: { query_handle: "flaky" } });

      await waitFor(() => expect(result.current.query).toBe(ENCODED_QUERY));
      expect(result.current.queryError).toBeNull();
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
