import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";
import type { ComponentProps } from "react";

import {
  createMockMetabotConversationDetail,
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDocumentEndpoints,
  setupGetMetabotConversationEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";
import type {
  MetabotAgentChatMessage,
  MetabotAgentTurnIncompleteMessage,
  MetabotChatMessage,
} from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  assertConversation,
  continueResponseButton,
  conversationIdForAgent,
  enterChatMessage,
  input,
  queryContinueResponseButton,
  setup as renderMetabotChat,
  thumbsDown,
  thumbsUp,
} from "metabase/metabot/tests/utils";
import type { FetchedChatMessage } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { createMockState } from "metabase/redux/store/mocks";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockCollection,
  createMockDocument,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import {
  AgentMessage,
  Messages,
} from "../components/MetabotChat/MetabotChatMessage";

registerVisualizations();

const textMessage = (
  role: "user" | "agent",
  message: string,
): FetchedChatMessage => ({ id: message, role, type: "text", message });

const setup = (
  message: MetabotAgentChatMessage,
  props?: Partial<ComponentProps<typeof AgentMessage>>,
) =>
  renderWithProviders(
    <AgentMessage
      debug={false}
      readonly={false}
      conversationId="convo-1"
      hideActions
      setFeedbackMessage={() => {}}
      submittedFeedback={undefined}
      getCopyText={() => ""}
      message={message}
      {...props}
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
        conversationId="convo-1"
      />,
    );

    const [, agentMessage] = screen.getAllByTestId("metabot-chat-message");
    expect(
      within(agentMessage).queryByTestId("metabot-chat-message-copy"),
    ).not.toBeInTheDocument();
  });

  it("hides the copy action when the agent response has no text", () => {
    renderWithProviders(
      <Messages
        messages={[
          { id: "u1", role: "user", type: "text", message: "hi" },
          {
            id: "a1",
            role: "agent",
            type: "data_part",
            part: { type: "data-todo_list", data: [] },
          },
        ]}
        isDoingScience={false}
        debug={false}
        conversationId="convo-1"
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
          conversationId="convo-1"
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
          conversationId="convo-1"
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

  describe("entity_saved", () => {
    it("renders a 'Chart X saved to Y' block with the container's current name", async () => {
      setupCollectionByIdEndpoint({
        collections: [
          createMockCollection({ id: 5, name: "Personal Collection" }),
        ],
      });
      setupCardEndpoints(createMockCard({ id: 99, name: "Accounts by Day" }));
      setup({
        id: "s1",
        role: "agent",
        type: "data_part",
        part: {
          type: "data-entity_saved",
          data: {
            chart_id: "chart-1",
            card_id: 99,
            destination: { type: "collection", id: 5 },
          },
        },
      });

      expect(
        await screen.findByText("Personal Collection"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Accounts by Day")).toBeInTheDocument();
    });

    it("renders a plain 'saved' row when the container can't be loaded", async () => {
      fetchMock.get("path:/api/collection/5", { status: 404 });
      setupCardEndpoints(createMockCard({ id: 99, name: "Accounts by Day" }));
      setup({
        id: "s1",
        role: "agent",
        type: "data_part",
        part: {
          type: "data-entity_saved",
          data: {
            chart_id: "chart-1",
            card_id: 99,
            destination: { type: "collection", id: 5 },
          },
        },
      });

      expect(await screen.findByText("Accounts by Day")).toBeInTheDocument();
      expect(screen.getByText(/saved/)).toBeInTheDocument();
      expect(screen.queryByText(/saved to/)).not.toBeInTheDocument();
    });

    it("resolves a document destination's current name", async () => {
      setupDocumentEndpoints(createMockDocument({ id: 7, name: "Q3 report" }));
      setupCardEndpoints(createMockCard({ id: 99, name: "Accounts by Day" }));
      setup({
        id: "s1",
        role: "agent",
        type: "data_part",
        part: {
          type: "data-entity_saved",
          data: {
            chart_id: "chart-1",
            card_id: 99,
            destination: { type: "document", id: 7 },
          },
        },
      });

      expect(await screen.findByText("Q3 report")).toBeInTheDocument();
      expect(await screen.findByText("Accounts by Day")).toBeInTheDocument();
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

      const conversationId = conversationIdForAgent(store);
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
          conversationId="convo-1"
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

  describe("turn_incomplete", () => {
    const incompleteMessage = (
      finishReason: MetabotAgentTurnIncompleteMessage["finishReason"],
    ): MetabotAgentTurnIncompleteMessage => ({
      id: "msg",
      role: "agent",
      type: "turn_incomplete",
      finishReason,
    });

    it("offers to continue a length-limited response", async () => {
      const onContinue = jest.fn();
      setup(incompleteMessage("length"), { onContinue });

      expect(
        screen.getByText(/was cut off because it hit the maximum length/),
      ).toBeInTheDocument();
      await userEvent.click(await continueResponseButton());
      expect(onContinue).toHaveBeenCalledWith(
        expect.stringMatching(/Pick up exactly where you left off/),
      );
    });

    it("offers to continue a step-limited response", async () => {
      const onContinue = jest.fn();
      setup(incompleteMessage("tool-calls"), { onContinue });

      expect(
        screen.getByText(/paused after reaching its step limit/),
      ).toBeInTheDocument();
      await userEvent.click(await continueResponseButton());
      expect(onContinue).toHaveBeenCalledWith(
        expect.stringMatching(/Continue working on my last request/),
      );
    });

    it("shows a terminal notice when the context window is full", () => {
      setup(
        { ...incompleteMessage("length"), contextWindowFull: true },
        { onContinue: jest.fn() },
      );

      expect(
        screen.getByText(/reached its maximum length and can't continue/),
      ).toBeInTheDocument();
      expect(queryContinueResponseButton()).not.toBeInTheDocument();
    });

    it("explains a content-filtered response without offering to continue", () => {
      setup(incompleteMessage("content-filter"), { onContinue: jest.fn() });

      expect(
        screen.getByText(/was stopped by a content filter/),
      ).toBeInTheDocument();
      expect(queryContinueResponseButton()).not.toBeInTheDocument();
    });

    it("falls back to a generic notice for other reasons", () => {
      setup(incompleteMessage("other"));

      expect(
        screen.getByText(/stopped before it finished/),
      ).toBeInTheDocument();
    });
  });
});

describe("UserMessage chart mentions", () => {
  it("renders a chart mention as an icon chip using conversation state", async () => {
    const datasetQuery = createMockStructuredDatasetQuery();
    const metabotState = assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "state"],
      {
        charts: {
          "chart-1": {
            queries: [datasetQuery],
            visualization_settings: { chart_type: "bar" },
          },
        },
      },
    );

    renderWithProviders(
      <Messages
        messages={[
          {
            id: "u1",
            role: "user",
            type: "text",
            message:
              "[Revenue by Product Category](metabase://chart/chart-1) test",
          },
        ]}
        isDoingScience={false}
        debug={false}
        conversationId="convo-1"
      />,
      {
        storeInitialState: createMockState({
          metabot: metabotState,
          currentUser: createMockUser(),
        }),
      },
    );

    expect(
      await screen.findByText("Revenue by Product Category"),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "bar icon" })).toBeInTheDocument();
  });
});
