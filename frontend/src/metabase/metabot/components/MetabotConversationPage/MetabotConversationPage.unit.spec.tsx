import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  createMockMetabotConversationDetail,
  setupDatabaseListEndpoint,
  setupGetMetabotConversationEndpoint,
  setupListMetabotConversationsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { createMockUser } from "metabase-types/api/mocks";

import { FIXED_METABOT_IDS } from "../../constants";
import { MetabotProvider } from "../../context";
import { getMetabotConversationId, metabotReducer } from "../../state";
import { getMetabotInitialState } from "../../state/reducer-utils";

import { MetabotConversationPage } from "./MetabotConversationPage";

const ASYNC_TIMEOUT = 3000;
const CONVERSATION_ROUTE = "/metabot/conversation/:convoId";
const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

const GREETING_TITLE =
  /What would you like to know\?|What do you want to explore\?|What are you looking to learn\?/;

const detailPath = (id: string) => `path:/api/metabot/conversations/${id}`;

const createAskState = ({
  conversationId,
  message,
}: {
  conversationId: string;
  message?: string;
}) => {
  const state = getMetabotInitialState();
  const ask = state.conversations.ask;
  if (!ask) {
    throw new Error("Expected ask conversation");
  }
  ask.conversationId = conversationId;
  if (message) {
    ask.messages.push({
      id: "seed-message",
      role: "user",
      type: "text",
      message,
    });
  }
  return state;
};

const TestConversationPage = (
  props: React.ComponentProps<typeof MetabotConversationPage>,
) => (
  <MetabotProvider>
    <MetabotConversationPage {...props} />
  </MetabotProvider>
);

interface SetupOptions {
  urlConversationId?: string;
  metabotInitialState?: ReturnType<typeof getMetabotInitialState>;
}

const setup = ({
  urlConversationId = CONVERSATION_ID,
  metabotInitialState = getMetabotInitialState(),
}: SetupOptions = {}) => {
  const settings = mockSettings({ "llm-metabot-configured?": true });

  setupEnterprisePlugins();
  setupUserMetabotPermissionsEndpoint();
  setupDatabaseListEndpoint([]);
  setupListMetabotConversationsEndpoint([]);
  fetchMock.get(
    `path:/api/metabot/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: [], offset: 0, limit: 3, total: 3 },
  );

  return renderWithProviders(
    <Route path={CONVERSATION_ROUTE} component={TestConversationPage} />,
    {
      withRouter: true,
      initialRoute: Urls.metabotConversation(urlConversationId),
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser(),
        metabot: metabotInitialState,
      }),
      customReducers: { metabot: metabotReducer },
    },
  );
};

describe("MetabotConversationPage", () => {
  it("shows a loader (not the greeting) while resuming, then the messages", async () => {
    fetchMock.removeRoute("test-conversation-detail");
    fetchMock.get(
      detailPath(CONVERSATION_ID),
      createMockMetabotConversationDetail({
        conversation_id: CONVERSATION_ID,
        messages: [
          {
            id: "m1",
            role: "user",
            type: "text",
            message: "Loaded question",
          },
        ],
      }),
      { delay: 150, name: "test-conversation-detail" },
    );

    const { store } = setup({
      metabotInitialState: createAskState({
        conversationId: OTHER_CONVERSATION_ID,
      }),
    });

    expect(
      await screen.findByTestId("metabot-conversation-loading"),
    ).toBeInTheDocument();
    expect(screen.queryByText(GREETING_TITLE)).not.toBeInTheDocument();

    expect(await screen.findByText("Loaded question")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-loading"),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getMetabotConversationId(store.getState(), "ask")).toBe(
        CONVERSATION_ID,
      );
    });
  });

  it("does not load when the ask agent already holds the URL conversation", async () => {
    setupGetMetabotConversationEndpoint(
      createMockMetabotConversationDetail({
        conversation_id: CONVERSATION_ID,
      }),
    );

    setup({
      metabotInitialState: createAskState({
        conversationId: CONVERSATION_ID,
        message: "Existing question",
      }),
    });

    expect(await screen.findByText("Existing question")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-loading"),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(detailPath(CONVERSATION_ID)),
    ).toHaveLength(0);
  });

  it("shows an error when the conversation cannot be loaded", async () => {
    fetchMock.removeRoute("test-conversation-detail");
    fetchMock.get(detailPath(CONVERSATION_ID), 404, {
      name: "test-conversation-detail",
    });

    const { history } = setup({
      metabotInitialState: createAskState({
        conversationId: OTHER_CONVERSATION_ID,
      }),
    });

    expect(
      await screen.findByText("Unable to load this conversation", undefined, {
        timeout: ASYNC_TIMEOUT,
      }),
    ).toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.metabotConversation(CONVERSATION_ID),
    );
  });
});
