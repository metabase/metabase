import { act, screen } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import type {
  MetabotMessagePart,
  MetabotState,
} from "metabase/metabot/state/types";
import {
  createTestMetabotState,
  setup,
  testConversationId,
  updateTestConversation,
} from "metabase/metabot/tests/utils";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { MetabotChatHistory } from "./MetabotChatHistory";

const makeVisibleState = (parts: MetabotMessagePart[]) =>
  updateTestConversation(
    createTestMetabotState({ visibleAgentIds: ["omnibot"] }),
    testConversationId("omnibot"),
    {
      messages: parts.map((part, index) => ({
        id: `message-${index}`,
        role: part.role,
        parts: [part],
        status: { type: "done" },
      })),
    },
  );

const withLongChatTokens = (state: MetabotState) => {
  const conversationId = testConversationId("omnibot");
  const { messages } = checkNotNull(state.conversations[conversationId]);
  return updateTestConversation(state, conversationId, {
    contextWindowTokens: 200,
    messages: messages.map((message, index) =>
      index === 1 ? { ...message, contextTokens: 200 } : message,
    ),
  });
};

describe("MetabotChatHistory", () => {
  it("should hide the long chat notice while the agent is responding", () => {
    const { store } = setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: withLongChatTokens(
        makeVisibleState([
          { id: "1", role: "user", type: "text", message: "hi" },
          { id: "2", role: "agent", type: "text", message: "hello" },
        ]),
      ),
    });

    expect(screen.getByTestId("metabot-long-chat-notice")).toBeInTheDocument();

    act(() => {
      store.dispatch(
        metabotActions.setIsProcessing({
          conversationId: testConversationId("omnibot"),
          processing: true,
        }),
      );
    });

    expect(
      screen.queryByTestId("metabot-long-chat-notice"),
    ).not.toBeInTheDocument();
  });

  it("does not render an agent message for a card-only reply", () => {
    setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: makeVisibleState([
        {
          id: "prompt",
          role: "user",
          type: "text",
          message: "Show me orders",
        },
        {
          id: "card",
          role: "agent",
          type: "data_part",
          part: {
            type: "data-generated_entity",
            data: {
              type: "card",
              id: "card-1",
              title: "Orders",
              query: {
                id: "q-1",
                query: Lib.toJsQuery(
                  Lib.createTestQuery(SAMPLE_PROVIDER, {
                    stages: [{ source: { type: "table", id: ORDERS_ID } }],
                  }),
                ),
              },
              display: "table",
            },
          },
        },
      ]),
    });

    expect(screen.getByText("Show me orders")).toBeInTheDocument();
    expect(screen.getAllByTestId("metabot-chat-message")).toHaveLength(1);
  });

  it("should not render chain_of_thought messages (app-only reasoning UI)", () => {
    setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: makeVisibleState([
        {
          id: "1",
          role: "agent",
          type: "chain_of_thought",
          steps: [{ kind: "reasoning", text: "Let me think about this" }],
          finished: true,
        },
      ]),
    });

    expect(
      screen.queryByTestId("metabot-chain-of-thought"),
    ).not.toBeInTheDocument();
  });

  it("should render non-chart messages normally", async () => {
    setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: makeVisibleState([
        { id: "1", role: "agent", type: "text", message: "Hello world" },
      ]),
    });

    expect(
      await screen.findByTestId("metabot-chat-message"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });
});
