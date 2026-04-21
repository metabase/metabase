import { renderWithProviders, screen } from "__support__/ui";

import { AgentErrorMessage } from "./MetabotChatMessage";

describe("AgentErrorMessage", () => {
  it("shows the managed-provider lockout message and actions", () => {
    renderWithProviders(
      <AgentErrorMessage
        message={{
          type: "locked",
          message: "unused",
        }}
      />,
    );

    expect(
      screen.getByText(/You've used all of your included AI service tokens\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use a different AI provider" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toHaveAttribute(
      "href",
      "https://store.staging.metabase.com/account/manage/plans",
    );
  });
});
