import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders } from "__support__/ui";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type {
  DashboardSavedValue,
  GeneratedCard,
  KnownDataPart,
} from "metabase/api/ai-streaming/schemas";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { State } from "metabase/redux/store";
import {
  getIsNavigationPending,
  getRouterLocation,
  hasUnsavedChanges,
  navigate,
} from "metabase/router";
import * as Urls from "metabase/urls";
import { setBasename } from "metabase/utils/basename";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";
import { sendAgentRequest } from "../state/actions";
import { getNavigateToPath } from "../state/selectors";

import { convoForAgent, createTestMetabotState } from "./utils";

jest.mock("metabase/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual("metabase/embedding-sdk/config"),
  isEmbeddingSdk: jest.fn(() => false),
}));

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  navigate: jest.fn(),
  getRouterLocation: jest.fn(),
  getIsNavigationPending: jest.fn(() => false),
  hasUnsavedChanges: jest.fn(() => false),
}));

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);
const mockedNavigate = jest.mocked(navigate);
const mockedGetRouterLocation = jest.mocked(getRouterLocation);
const mockedHasUnsavedChanges = jest.mocked(hasUnsavedChanges);
const mockedIsEmbeddingSdk = jest.mocked(isEmbeddingSdk);
const mockedGetIsNavigationPending = jest.mocked(getIsNavigationPending);

const datasetQuery = Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

const createCard = (overrides: Partial<GeneratedCard> = {}): GeneratedCard => ({
  type: "card",
  id: "chart-a",
  title: "Orders by month",
  query: { id: "query-a", query: datasetQuery },
  ...overrides,
});

const cardPart = (card: GeneratedCard): KnownDataPart => ({
  type: "data-generated_entity",
  data: card,
});

const dashboardSavedPart = (
  overrides: Partial<DashboardSavedValue> = {},
): KnownDataPart => ({
  type: "data-dashboard_saved",
  data: {
    dashboard_id: 43,
    action: "updated",
    name: "Churn overview",
    url: "/dashboard/43",
    collection_id: 31,
    open: true,
    saved_charts: [{ chart_id: "chart-a", card_id: 501 }],
    tool_call_id: "call-1",
    ...overrides,
  },
});

const viewing = (pathname: string, hash = "") => ({
  pathname,
  search: "",
  hash,
  state: null,
  key: "default",
});

const setupStore = () => {
  const { store } = renderWithProviders(
    <MetabotProvider>{null}</MetabotProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser(),
        settings: mockSettings({ "llm-metabot-configured?": true }),
        // a titled conversation doesn't poll for its title
        metabot: createTestMetabotState({ conversationTitle: "Churn" }),
      }),
    },
  );
  // `renderWithProviders` types its store without thunks, which the store accepts.
  return store as Omit<typeof store, "dispatch" | "getState"> & {
    dispatch: ThunkDispatch<State, void, UnknownAction>;
    getState: () => State;
  };
};

interface StreamTurnOpts {
  parts: KnownDataPart[];
  isFullPageMetabot?: boolean;
  aborted?: boolean;
  errorText?: string;
  /** Runs after the parts stream and before the turn ends. */
  duringTurn?: () => void;
}

const streamTurn = async ({
  parts,
  isFullPageMetabot = false,
  aborted = false,
  errorText,
  duringTurn,
}: StreamTurnOpts) => {
  const store = setupStore();
  mockedAiStreamingQuery.mockImplementation(async (_request, callbacks) => {
    callbacks?.onStart?.({ type: "start", messageId: "msg_turn" });
    parts.forEach((part) => callbacks?.onDataPart?.(part));
    if (errorText) {
      callbacks?.onError?.({ errorText });
    }
    duringTurn?.();
    return { aborted, toolCalls: [], data: [] };
  });

  await act(async () => {
    await store.dispatch(
      sendAgentRequest({
        message: "Add the charts",
        conversation_id: convoForAgent(store).conversationId,
        assistant_message_id: "msg_turn",
        isFullPageMetabot,
        context: {
          user_is_viewing: [],
          current_time_with_timezone: "2026-11-17T00:00:00Z",
          capabilities: [],
        },
      }),
    );
  });
  return store;
};

describe("metabot > where a sidebar turn leaves the user", () => {
  beforeEach(() => {
    setupEnterprisePlugins();
    mockedAiStreamingQuery.mockReset();
    mockedNavigate.mockReset();
    mockedHasUnsavedChanges.mockReturnValue(false);
    mockedGetIsNavigationPending.mockReturnValue(false);
    mockedIsEmbeddingSdk.mockReturnValue(false);
    mockedGetRouterLocation.mockReturnValue(viewing("/collection/root"));
    jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
  });

  afterEach(() => {
    fetchMock.removeRoutes();
    setBasename("");
  });

  it("opens only the dashboard that saved the turn's charts", async () => {
    await streamTurn({
      parts: [
        cardPart(createCard({ id: "chart-a" })),
        cardPart(createCard({ id: "chart-b" })),
        dashboardSavedPart(),
      ],
    });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith("/dashboard/43");
  });

  it("stays on the dashboard that saved the turn's charts", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/dashboard/43-churn"));

    await streamTurn({
      parts: [cardPart(createCard()), dashboardSavedPart()],
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("keeps a chart in the conversation when the user is on a dashboard", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/dashboard/43-churn"));

    await streamTurn({ parts: [cardPart(createCard())] });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("opens the turn's last chart once, as a card Metabot opened", async () => {
    const lastCard = createCard({ id: "chart-b", title: "Orders by week" });

    const store = await streamTurn({
      parts: [cardPart(createCard()), cardPart(lastCard)],
    });

    const url = Urls.generatedEntity(lastCard);
    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith(url);
    expect(store.getState().qb.pendingMetabotCard).toEqual({ url });
  });

  it("doesn't move a user who moved during the turn", async () => {
    await streamTurn({
      parts: [cardPart(createCard())],
      duringTurn: () =>
        mockedGetRouterLocation.mockReturnValue(viewing("/browse/databases")),
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't move a user who opened another question at the same path", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/question", "#chart-a"));

    await streamTurn({
      parts: [cardPart(createCard({ id: "chart-b" }))],
      duringTurn: () =>
        mockedGetRouterLocation.mockReturnValue(
          viewing("/question", "#chart-c"),
        ),
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't move a user whose navigation is still loading", async () => {
    await streamTurn({
      parts: [cardPart(createCard())],
      duringTurn: () => mockedGetIsNavigationPending.mockReturnValue(true),
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't leave unsaved work", async () => {
    mockedHasUnsavedChanges.mockReturnValue(true);

    await streamTurn({ parts: [cardPart(createCard()), dashboardSavedPart()] });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("stays on the saved dashboard under a subpath", async () => {
    setBasename("/metabase");
    mockedGetRouterLocation.mockReturnValue(
      viewing("/metabase/dashboard/43-churn"),
    );

    await streamTurn({ parts: [dashboardSavedPart()] });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't open a dashboard whose save doesn't ask for it", async () => {
    await streamTurn({
      parts: [dashboardSavedPart({ action: "trashed", open: false })],
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("opens an X-ray from a dashboard", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/dashboard/43-churn"));

    await streamTurn({
      parts: [
        {
          type: "data-generated_entity",
          data: {
            type: "dashboard",
            title: "A look at Orders",
            url: "/auto/dashboard/table/2",
          },
        },
      ],
    });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith("/auto/dashboard/table/2");
  });

  it("opens a chart made after the dashboard was saved", async () => {
    const lastCard = createCard({ id: "chart-b" });

    await streamTurn({ parts: [dashboardSavedPart(), cardPart(lastCard)] });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith(Urls.generatedEntity(lastCard));
  });

  it("opens the saved dashboard when a later chart can't open on a dashboard", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/dashboard/12-sales"));

    await streamTurn({ parts: [dashboardSavedPart(), cardPart(createCard())] });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith("/dashboard/43");
  });

  it("doesn't open a dashboard the turn trashed after saving it", async () => {
    const trashedPart = dashboardSavedPart({ action: "trashed", open: false });

    await streamTurn({ parts: [dashboardSavedPart(), trashedPart] });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't fall back to a dashboard the turn trashed", async () => {
    mockedGetRouterLocation.mockReturnValue(viewing("/dashboard/12-sales"));
    const trashedPart = dashboardSavedPart({ action: "trashed", open: false });

    await streamTurn({
      parts: [dashboardSavedPart(), trashedPart, cardPart(createCard())],
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("still opens a saved dashboard after a later save that only links to it", async () => {
    const linkedPart = dashboardSavedPart({ action: "updated", open: false });

    await streamTurn({ parts: [dashboardSavedPart(), linkedPart] });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith("/dashboard/43");
  });

  it("opens a chart made after the turn trashed its saved dashboard", async () => {
    const card = createCard();
    const trashedPart = dashboardSavedPart({ action: "trashed", open: false });

    await streamTurn({
      parts: [dashboardSavedPart(), cardPart(card), trashedPart],
    });

    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith(Urls.generatedEntity(card));
  });

  it("hands a chart to the embedding SDK as it arrives", async () => {
    mockedIsEmbeddingSdk.mockReturnValue(true);
    const card = createCard();

    const store = await streamTurn({
      parts: [cardPart(card), dashboardSavedPart()],
    });

    expect(getNavigateToPath(store.getState())).toBe(
      Urls.generatedEntity(card),
    );
    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't navigate after a stopped turn", async () => {
    await streamTurn({ parts: [cardPart(createCard())], aborted: true });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't navigate after a failed turn", async () => {
    await streamTurn({
      parts: [cardPart(createCard())],
      errorText: "Something broke",
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't navigate from full-page Metabot", async () => {
    await streamTurn({
      parts: [cardPart(createCard()), dashboardSavedPart()],
      isFullPageMetabot: true,
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });
});
