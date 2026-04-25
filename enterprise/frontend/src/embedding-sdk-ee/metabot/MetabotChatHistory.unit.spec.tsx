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
  it("should not render chart messages in the message list", () => {
    setup({
      ui: <MetabotChatHistory />,
      metabotInitialState: makeVisibleState([
        {
          id: "1",
          role: "agent",
          type: "chart",
          navigateTo: "/question#abc",
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
