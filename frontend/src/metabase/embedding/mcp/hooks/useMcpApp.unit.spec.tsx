import { act, renderHook } from "@testing-library/react";

import { useMcpApp } from "./useMcpApp";

const mockUseApp = jest.fn();

jest.mock("@modelcontextprotocol/ext-apps/react", () => ({
  applyDocumentTheme: jest.fn(),
  applyHostFonts: jest.fn(),
  applyHostStyleVariables: jest.fn(),
  useApp: (...args: unknown[]) => mockUseApp(...args),
}));

describe("useMcpApp", () => {
  it("accepts a query only when its tool result includes a UI credential", () => {
    const app: Record<string, any> = {
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
      app.ontoolresult({ structuredContent: { query: "ignored-query" } });
    });

    expect(result.current.query).toBeNull();
    expect(result.current.uiCredential).toBe("");
    expect(result.current.mcpSessionId).toBe("");

    act(() => {
      app.ontoolresult({
        structuredContent: { query: "encoded-query" },
        _meta: {
          "com.metabase/mcp-ui": {
            credential: "fresh-credential",
            sessionId: "mcp-session-id",
          },
        },
      });
    });

    expect(result.current.query).toBe("encoded-query");
    expect(result.current.uiCredential).toBe("fresh-credential");
    expect(result.current.mcpSessionId).toBe("mcp-session-id");
  });
});
