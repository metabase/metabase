import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "metabase/metabot/tests/utils";

import { MetabotChatInput } from "./MetabotChatInput";

const fullContextState = () => {
  const state = getMetabotInitialState();
  const conversation = state.conversations.omnibot;
  if (!conversation) {
    throw new Error("Expected the omnibot conversation to exist");
  }
  conversation.lastTokenUsage = {
    contextTokens: 200,
    contextWindowTokens: 200,
  };
  return state;
};

describe("MetabotChatInput", () => {
  it("stays usable once the context window is full", async () => {
    const agentEndpoint = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
    });
    setup({
      ui: <MetabotChatInput />,
      metabotInitialState: fullContextState(),
    });

    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("readonly");

    await userEvent.type(input, "Who is your favorite?{Enter}");

    await waitFor(() => expect(agentEndpoint).toHaveBeenCalled());
  });
});
