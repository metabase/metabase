import userEvent from "@testing-library/user-event";

import { fireEvent, screen } from "__support__/ui";
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
    contextTokens: 190,
    contextWindowTokens: 200,
  };
  return state;
};

describe("MetabotChatInput", () => {
  it("prevents submission when the context window is full", async () => {
    const agentEndpoint = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
    });
    setup({
      ui: <MetabotChatInput />,
      metabotInitialState: fullContextState(),
    });

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute(
      "placeholder",
      "Start a new chat to continue",
    );

    await userEvent.type(input, "This should not be sent");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(agentEndpoint).not.toHaveBeenCalled();
  });
});
