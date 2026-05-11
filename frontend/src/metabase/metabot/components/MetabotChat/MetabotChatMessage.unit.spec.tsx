import { renderWithProviders, screen } from "__support__/ui";

import { AgentMessage } from "./MetabotChatMessage";

describe("AgentMessage turn_errored", () => {
  it("shows the managed-provider lockout message and actions", () => {
    renderWithProviders(
      <AgentMessage
        debug={false}
        readonly={false}
        hideActions
        showFeedbackButtons={false}
        setFeedbackMessage={() => {}}
        submittedFeedback={undefined}
        onCopy={() => {}}
        message={{
          id: "msg-1",
          role: "agent",
          type: "turn_errored",
          error: { type: "metabase_ai_managed_locked" },
          display: {
            type: "locked",
            message: "You've used all of your included AI service tokens.",
          },
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

  it("falls back to a generic alert message when display is missing", () => {
    renderWithProviders(
      <AgentMessage
        debug={false}
        readonly={false}
        hideActions
        showFeedbackButtons={false}
        setFeedbackMessage={() => {}}
        submittedFeedback={undefined}
        onCopy={() => {}}
        message={{
          id: "msg-2",
          role: "agent",
          type: "turn_errored",
          error: { type: "stream_error" },
        }}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
