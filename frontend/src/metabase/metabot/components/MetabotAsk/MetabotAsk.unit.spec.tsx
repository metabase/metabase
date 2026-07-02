import { assocIn } from "icepick";

import { screen, waitFor } from "__support__/ui";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { getMetabotVisible } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import {
  enterChatMessage,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "../../tests/utils";

import { MetabotAsk } from "./MetabotAsk";

const greetingTitle =
  /What would you like to know\?|What do you want to explore\?|What are you looking to learn\?/;

describe("MetabotAsk", () => {
  it("shows the greeting and closes the global Metabot sidebar", async () => {
    const metabotInitialState = assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "visible"],
      true,
    );

    const { store } = setup({
      ui: <MetabotAsk />,
      metabotInitialState,
      promptSuggestions: [{ prompt: "Show me all orders" }],
    });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(await screen.findByText("Show me all orders")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-chat-input")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
    expect(getMetabotVisible(store.getState(), "omnibot")).toBe(false);
  });

  it("replaces the greeting with the conversation after sending a message", async () => {
    setup({ ui: <MetabotAsk /> });
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();

    await enterChatMessage("Who is your favorite?");

    expect(
      await screen.findByText("Who is your favorite?"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(screen.queryByText(greetingTitle)).not.toBeInTheDocument();
  });

  it("injects a chart pasted into the greeting into the ask conversation state", async () => {
    const { store } = setup({ ui: <MetabotAsk /> });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();

    const datasetQuery = createMockStructuredDatasetQuery();
    const chartText = serializeChartClipboard(
      {
        name: "Revenue by Category",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        chart_id: "chart-1",
        query_id: "query-1",
      },
      "https://metabase.example",
    );

    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? chartText : ""),
      },
    });
    screen.getByRole("textbox").dispatchEvent(event);

    await waitFor(() => {
      const askState = store.getState().metabot.conversations.ask?.state;
      expect(askState?.charts?.["chart-1"]).toBeDefined();
      expect(askState?.queries?.["query-1"]).toEqual(datasetQuery);
    });
  });

  it("shows the AI provider setup notice in the greeting when not configured", async () => {
    setup({
      ui: <MetabotAsk />,
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
