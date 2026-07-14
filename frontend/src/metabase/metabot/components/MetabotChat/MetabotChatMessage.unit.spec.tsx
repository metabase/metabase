import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  createMockMetabotConversationDetail,
  setupGetMetabotConversationEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";
import type {
  MetabotAgentChatMessage,
  MetabotChatMessage,
} from "metabase/metabot/state";
import {
  assertConversation,
  enterChatMessage,
  input,
  setup as renderMetabotChat,
  thumbsDown,
  thumbsUp,
} from "metabase/metabot/tests/utils";
import type { FetchedChatMessage } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { createMockUser } from "metabase-types/api/mocks";

import { AgentMessage, Messages } from "./MetabotChatMessage";

const textMessage = (
  role: "user" | "agent",
  message: string,
): FetchedChatMessage => ({ id: message, role, type: "text", message });

const setup = (message: MetabotAgentChatMessage) =>
  renderWithProviders(
    <AgentMessage
      debug={false}
      readonly={false}
      hideActions
      setFeedbackMessage={() => {}}
      submittedFeedback={undefined}
      getCopyText={() => ""}
      message={message}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );

describe("AgentMessage", () => {
  it("hides the action bar on the last agent message while processing", () => {
    renderWithProviders(
      <Messages
        messages={[
          { id: "u1", role: "user", type: "text", message: "hi" },
          { id: "a1", role: "agent", type: "text", message: "hello" },
        ]}
        isDoingScience
        debug={false}
      />,
    );

    const [, agentMessage] = screen.getAllByTestId("metabot-chat-message");
    expect(
      within(agentMessage).queryByTestId("metabot-chat-message-copy"),
    ).not.toBeInTheDocument();
  });

  describe("feedback controls", () => {
    const conversation: MetabotChatMessage[] = [
      { id: "u1", role: "user", type: "text", message: "hi" },
      {
        id: "a1",
        role: "agent",
        type: "text",
        message: "hello",
        externalId: "a1-ext",
      },
    ];

    it("shows feedback ratings in an interactive conversation", async () => {
      renderWithProviders(
        <Messages
          messages={conversation}
          isDoingScience={false}
          debug={false}
        />,
      );

      const [, agentMessage] = screen.getAllByTestId("metabot-chat-message");
      expect(await thumbsUp(agentMessage)).toBeInTheDocument();
      expect(await thumbsDown(agentMessage)).toBeInTheDocument();
    });

    it("hides feedback ratings in a read-only conversation", () => {
      renderWithProviders(
        <Messages
          messages={conversation}
          isDoingScience={false}
          debug={false}
          readonly
        />,
      );

      expect(
        screen.queryByTestId("metabot-chat-message-thumbs-up"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("metabot-chat-message-thumbs-down"),
      ).not.toBeInTheDocument();
    });
  });

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

    it("shows a refresh button for conversation_out_of_sync errors that reloads the conversation", async () => {
      const { store } = renderMetabotChat();
      fetchMock.post(`path:/api/metabot/agent-streaming`, 409);

      await enterChatMessage("How many orders?");

      await assertConversation([
        ["user", "How many orders?"],
        ["agent", METABOT_ERR_MSG.outOfSync],
      ]);
      expect(await input()).toHaveTextContent("How many orders?");

      const conversationId =
        store.getState().metabot.conversations.omnibot?.conversationId;
      if (!conversationId) {
        throw new Error("expected an active omnibot conversation");
      }
      const reloaded: ["user" | "agent", string][] = [
        ["user", "How many orders?"],
        ["agent", "There are 42 orders."],
        ["user", "And grouped by month?"],
        ["agent", "Here is the monthly breakdown."],
      ];
      setupGetMetabotConversationEndpoint(
        createMockMetabotConversationDetail({
          conversation_id: conversationId,
          messages: reloaded.map(([role, message]) =>
            textMessage(role, message),
          ),
        }),
      );

      await userEvent.click(
        await screen.findByTestId("metabot-chat-message-refresh"),
      );

      await assertConversation(reloaded);
      expect(await input()).toHaveTextContent("");
    });

    it("renders the raw error payload as a debug card when debug is true", () => {
      renderWithProviders(
        <AgentMessage
          debug
          readonly={false}
          hideActions
          setFeedbackMessage={() => {}}
          submittedFeedback={undefined}
          getCopyText={() => ""}
          message={{
            id: "msg",
            role: "agent",
            type: "turn_errored",
            error: { type: "stream_error", message: "boom" },
          }}
        />,
      );

      const debugCard = screen.getByTestId(
        "metabot-chat-message-turn-alert-debug",
      );
      expect(debugCard).toHaveTextContent(/stream_error/);
      expect(debugCard).toHaveTextContent(/boom/);
    });
  });
});
