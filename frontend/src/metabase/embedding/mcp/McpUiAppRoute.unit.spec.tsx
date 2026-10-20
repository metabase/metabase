import { type ReactNode, useEffect } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { utf8_to_b64 } from "metabase/utils/encoding";

import { McpUiAppRoute } from "./McpUiAppRoute";
import { type McpAppState, useMcpApp } from "./hooks/useMcpApp";

const mockQuestionMounts = jest.fn<void, []>();

jest.mock("./hooks/useMcpApp", () => ({ useMcpApp: jest.fn() }));

jest.mock("./hooks/useMcpUserAndSettingsFetch", () => ({
  useMcpUserAndSettingsFetch: () => ({
    isSettingsReady: true,
    userAndSettingsFetchError: null,
  }),
}));

jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("embedding-sdk-bundle/components/public/SdkQuestion", () => ({
  SdkQuestion: function MockSdkQuestion() {
    useEffect(() => mockQuestionMounts(), []);
    return <div>question</div>;
  },
}));

const QUERY = utf8_to_b64(
  JSON.stringify({ database: 1, type: "query", query: { "source-table": 1 } }),
);

const appState = (overrides: Partial<McpAppState>): McpAppState => ({
  app: null,
  hostError: null,
  hostContext: { theme: "light" },
  mcpSessionId: "session-1",
  uiCredential: "credential-1",
  prompt: null,
  query: QUERY,
  queryError: null,
  ...overrides,
});

const setup = (state: McpAppState) => {
  jest.mocked(useMcpApp).mockReturnValue(state);
  const { rerender } = renderWithProviders(<McpUiAppRoute />);

  return {
    setState: (next: McpAppState) => {
      jest.mocked(useMcpApp).mockReturnValue(next);
      rerender(<McpUiAppRoute />);
    },
  };
};

describe("McpUiAppRoute", () => {
  beforeEach(() => {
    window.metabaseConfig = { instanceUrl: "http://localhost:3000" };
  });

  it("keeps the chart mounted while the credential is renewed after it expired", () => {
    const { setState } = setup(appState({}));
    expect(screen.getByText("question")).toBeInTheDocument();

    // A remount would build the question from the tool result's query while
    // the current handle still names the query the user derived.
    setState(appState({ uiCredential: "", mcpSessionId: "" }));
    expect(screen.getByText("question")).toBeInTheDocument();

    setState(appState({ uiCredential: "credential-2" }));
    expect(screen.getByText("question")).toBeInTheDocument();
    expect(mockQuestionMounts).toHaveBeenCalledTimes(1);
  });
});
