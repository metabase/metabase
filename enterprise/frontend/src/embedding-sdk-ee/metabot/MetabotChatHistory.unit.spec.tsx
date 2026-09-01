import { assocIn } from "icepick";

import { act, screen } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import type { MetabotChatMessage } from "metabase/metabot/state/types";
import {
  createTestMetabotState,
  setup,
  testConversationId,
} from "metabase/metabot/tests/utils";

import { MetabotChatHistory } from "./MetabotChatHistory";

const makeVisibleState = (messages: MetabotChatMessage[]) =>
  assocIn(
    assocIn(createTestMetabotState(), ["agents", "omnibot", "visible"], true),
    ["conversations", testConversationId("omnibot"), "messages"],
    messages,
  );

describe("MetabotChatHistory", () => {
  it("should hide the long chat notice while the agent is responding", () => {
    const { store } = setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: assocIn(
        makeVisibleState([
          { id: "1", role: "user", type: "text", message: "hi" },
        ]),
        ["conversations", testConversationId("omnibot"), "lastTokenUsage"],
        { contextTokens: 200, contextWindowTokens: 200 },
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

  it("should not render generated_entity card data_part messages in the message list", () => {
    setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: makeVisibleState([
        {
          id: "1",
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
                query: {
                  database: 1,
                  type: "query",
                  query: { "source-table": 1 },
                },
              },
              display: "table",
            },
          },
        },
      ]),
    });

    expect(
      screen.queryByTestId("metabot-chat-message"),
    ).not.toBeInTheDocument();
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
