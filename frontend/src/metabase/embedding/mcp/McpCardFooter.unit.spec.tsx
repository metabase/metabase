import { renderWithProviders, screen } from "__support__/ui";

import { McpCardFooter } from "./McpCardFooter";

jest.mock("./McpExploreButton", () => ({
  McpExploreButton: () => <button>Explore in Metabase</button>,
}));

function setup({ isFeedbackEnabled }: { isFeedbackEnabled: boolean }) {
  renderWithProviders(
    <McpCardFooter
      app={null}
      footerStyle={{}}
      instanceUrl=""
      isFeedbackEnabled={isFeedbackEnabled}
      isSubmittingFeedback={false}
      onSelectFeedback={jest.fn()}
      submittedFeedback={null}
    />,
  );
}

describe("McpCardFooter", () => {
  it("shows feedback choices when feedback is enabled", () => {
    setup({ isFeedbackEnabled: true });

    expect(screen.getByTestId("mcp-feedback-thumbs-up")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-feedback-thumbs-down")).toBeInTheDocument();
  });

  it("hides feedback choices when feedback is not enabled", () => {
    setup({ isFeedbackEnabled: false });

    expect(
      screen.queryByTestId("mcp-feedback-thumbs-up"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mcp-feedback-thumbs-down"),
    ).not.toBeInTheDocument();
  });
});
