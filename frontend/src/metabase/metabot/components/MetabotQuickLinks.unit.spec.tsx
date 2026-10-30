import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupGetMetabotConversationTitleEndpoint,
  setupListMetabotConversationsEndpoint,
  setupMetabotSamplePromptSuggestionsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Outlet, Route } from "metabase/router";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { FIXED_METABOT_ENTITY_IDS } from "../constants";
import { MetabotProvider } from "../context";
import { metabotReducer } from "../state";
import {
  createTestMetabotState,
  lastReqBody,
  mockAgentEndpoint,
  whoIsYourFavoriteResponse,
} from "../tests/utils";

import { Metabot } from "./Metabot";
import { getMetabotQuickLinks } from "./MetabotQuickLinks";

const PROMPT = "Who is your favorite?";

interface SetupOpts {
  isMetabotEnabled: boolean;
}

const setup = ({ isMetabotEnabled }: SetupOpts) => {
  setupEnterprisePlugins();
  setupUserMetabotPermissionsEndpoint(createMockUserMetabotPermissions());
  setupMetabotSamplePromptSuggestionsEndpoint(FIXED_METABOT_ENTITY_IDS.DEFAULT);
  setupDatabaseListEndpoint([]);
  setupListMetabotConversationsEndpoint([]);
  setupGetMetabotConversationTitleEndpoint({ status: "pending", title: null });
  const agentSpy = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

  const { router } = renderWithProviders(
    <Route
      path="/"
      element={
        <MetabotProvider>
          <Metabot />
          <Outlet />
        </MetabotProvider>
      }
    >
      {getMetabotQuickLinks()}
    </Route>,
    {
      withRouter: true,
      initialRoute: `/metabot/new?q=${encodeURIComponent(PROMPT)}`,
      storeInitialState: createMockState({
        settings: mockSettings({
          "metabot-enabled?": isMetabotEnabled,
          "llm-metabot-configured?": true,
        }),
        metabot: createTestMetabotState(),
      }),
      customReducers: { metabot: metabotReducer },
    },
  );

  return { agentSpy, router };
};

describe("MetabotQuickLinks > /metabot/new", () => {
  it("redirects to the home page, opens the chat and submits the prompt", async () => {
    const { agentSpy, router } = setup({ isMetabotEnabled: true });

    await waitFor(() => expect(router?.location.pathname).toBe("/"));
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();

    const body: unknown = await lastReqBody(agentSpy);
    expect(body).toEqual(expect.objectContaining({ message: PROMPT }));
    expect(agentSpy).toHaveBeenCalledTimes(1);
  });

  it("redirects to the home page without submitting the prompt when metabot is disabled", async () => {
    const { agentSpy, router } = setup({ isMetabotEnabled: false });

    await waitFor(() => expect(router?.location.pathname).toBe("/"));
    expect(router?.location.search).toBe("");
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
    expect(agentSpy).not.toHaveBeenCalled();
  });
});
