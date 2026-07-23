import { assocIn } from "icepick";

import { screen } from "__support__/ui";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import type { MetabotChatMessage } from "metabase/metabot/state/types";
import { setup } from "metabase/metabot/tests/utils";

import { MetabotChatHistory } from "./MetabotChatHistory";

const makeVisibleState = (messages: MetabotChatMessage[]) =>
  assocIn(
    assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "visible"],
      true,
    ),
    ["conversations", "omnibot", "messages"],
    messages,
  );

describe("MetabotChatHistory", () => {
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
