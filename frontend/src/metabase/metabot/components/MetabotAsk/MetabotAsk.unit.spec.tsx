import { assocIn } from "icepick";

import { screen } from "__support__/ui";
import { getMetabotVisible } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockUser } from "metabase-types/api/mocks";

import {
  enterChatMessage,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "../../tests/utils";

import { MetabotAsk } from "./MetabotAsk";

const greetingTitle =
  /What would you like to know\?|What do you want to explore\?|What are you looking to learn\?/;

type SetupOpts = Exclude<Parameters<typeof setup>[0], void>;

const setupMetabotAsk = (options?: Omit<SetupOpts, "ui">) =>
  setup({ ...options, ui: <MetabotAsk /> });

describe("MetabotAsk", () => {
  it("shows the greeting and closes the global Metabot sidebar", async () => {
    const metabotInitialState = assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "visible"],
      true,
    );

    const { store } = setupMetabotAsk({
      metabotInitialState,
      promptSuggestions: [{ prompt: "Show me all orders" }],
    });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(await screen.findByText("Show me all orders")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-chat-input")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat-title")).not.toBeInTheDocument();
    expect(getMetabotVisible(store.getState(), "omnibot")).toBe(false);
  });

  it("replaces the greeting with the conversation after sending a message", async () => {
    setupMetabotAsk();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();

    await enterChatMessage("Who is your favorite?");

    expect(
      await screen.findByText("Who is your favorite?"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(await screen.findByTestId("metabot-chat-title")).toHaveTextContent(
      "New conversation",
    );
    expect(screen.queryByText(greetingTitle)).not.toBeInTheDocument();
  });

  it("replaces the untitled placeholder with the generated title", async () => {
    setupMetabotAsk();
    mockAgentEndpoint({
      events: [{ type: "data-chat-title", data: "Orders by Month" }],
    });

    await enterChatMessage("Show orders by month");

    expect(await screen.findByTestId("metabot-chat-title")).toHaveTextContent(
      "Orders by Month",
    );
  });

  it("shows the AI provider setup notice in the greeting when not configured", async () => {
    setupMetabotAsk({
      currentUser: createMockUser({ is_superuser: true }),
      isConfigured: false,
    });

    expect(
      await screen.findByText("To use AI exploration, please", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat-input")).not.toBeInTheDocument();
  });
});
