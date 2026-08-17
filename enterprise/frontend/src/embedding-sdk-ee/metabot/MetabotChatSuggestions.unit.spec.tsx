import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { setup } from "metabase/metabot/tests/utils";

import { MetabotChatSuggestions } from "./MetabotChatSuggestions";

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

const setupSuggestedPrompts = (isContextWindowFull = false) => {
  fetchMock.get(
    `path:/api/metabot/metabot/${FIXED_METABOT_IDS.EMBEDDED}/prompt-suggestions`,
    {
      prompts: [{ prompt: "Show me revenue" }],
      offset: 0,
      limit: 3,
      total: 1,
    },
  );
  setup({
    ui: <MetabotChatSuggestions />,
    metabotInitialState: isContextWindowFull ? fullContextState() : undefined,
  });
};

describe("MetabotChatSuggestions", () => {
  it("shows suggestions while the context window has room", async () => {
    setupSuggestedPrompts();

    expect(await screen.findByText("Show me revenue")).toBeInTheDocument();
  });

  it("hides suggestions when the context window is full", async () => {
    setupSuggestedPrompts(true);

    await waitFor(() => {
      expect(fetchMock.callHistory.called(/prompt-suggestions/)).toBe(true);
    });
    expect(
      screen.queryByTestId("metabot-suggestion-button"),
    ).not.toBeInTheDocument();
  });
});
