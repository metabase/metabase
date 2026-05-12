import { renderWithProviders, screen } from "__support__/ui";
import type { MetabotAgentChatMessage } from "metabase/metabot/state";

import { AgentMessage } from "./MetabotChatMessage";

const setup = (message: MetabotAgentChatMessage) =>
  renderWithProviders(
    <AgentMessage
      debug={false}
      readonly={false}
      hideActions
      showFeedbackButtons={false}
      setFeedbackMessage={() => {}}
      submittedFeedback={undefined}
      onCopy={() => {}}
      message={message}
    />,
  );

describe("AgentMessage", () => {
  describe("turn_errored", () => {
    it("shows locked message for metabase_ai_managed_locked errors", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "metabase_ai_managed_locked" },
        display: {
          type: "locked",
          message: "You've used all of your included AI service tokens.",
        },
      });

      expect(
        screen.getByText(
          /You've used all of your included AI service tokens\./,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Start paid subscription/ }),
      ).toHaveAttribute(
        "href",
        "https://store.staging.metabase.com/account/manage/plans",
      );
    });

    it("shows the custom display message when provided", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "stream_error" },
        display: {
          type: "alert",
          message: "The model is overloaded, please try again.",
        },
      });

      expect(
        screen.getByText(/The model is overloaded, please try again\./),
      ).toBeInTheDocument();
    });

    it("shows generic alert message when display message is missing", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "stream_error" },
      });

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});
