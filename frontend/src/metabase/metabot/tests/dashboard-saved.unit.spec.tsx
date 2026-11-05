import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen } from "__support__/ui";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type { DashboardSavedValue } from "metabase/api/ai-streaming/schemas";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { State } from "metabase/redux/store";
import { getRouterLocation, navigate } from "metabase/router";
import {
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";
import { useOnMetabotDashboardSave } from "../hooks/use-on-metabot-dashboard-save";
import { dashboardSaved } from "../state";
import { sendAgentRequest } from "../state/actions";
import { getSavedChartCardId, getSavedDashboard } from "../state/selectors";

import { convoForAgent, createTestMetabotState } from "./utils";

jest.mock("metabase/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  navigate: jest.fn(),
  getRouterLocation: jest.fn(),
}));

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);
const mockedNavigate = jest.mocked(navigate);
const mockedGetRouterLocation = jest.mocked(getRouterLocation);

const createDashboardSaved = (
  overrides: Partial<DashboardSavedValue> = {},
): DashboardSavedValue => ({
  dashboard_id: 43,
  action: "created",
  name: "Churn overview",
  url: "/dashboard/43",
  collection_id: 31,
  open: true,
  saved_charts: [{ chart_id: "chart-a", card_id: 501 }],
  tool_call_id: "call-1",
  ...overrides,
});

const viewing = (pathname: string) => ({
  pathname,
  search: "",
  hash: "",
  state: null,
  key: "default",
});

const ChatMessagesProbe = () => {
  const { conversationId, messages } = useMetabotAgent("omnibot");

  return (
    <Messages
      size="md"
      messages={messages}
      isDoingScience={false}
      debug={false}
      conversationId={conversationId}
    />
  );
};

const setupStore = (ui: React.ReactElement) => {
  const { store } = renderWithProviders(
    <MetabotProvider>{ui}</MetabotProvider>,
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

const streamDashboardSaved = async (
  value: DashboardSavedValue,
  { isFullPageMetabot = false }: { isFullPageMetabot?: boolean } = {},
) => {
  mockedAiStreamingQuery.mockImplementation(async (_request, callbacks) => {
    callbacks?.onStart?.({ type: "start", messageId: "msg_dashboard_saved" });
    callbacks?.onDataPart?.({ type: "data-dashboard_saved", data: value });
    return { aborted: false, toolCalls: [], data: [] };
  });

  const store = setupStore(<ChatMessagesProbe />);
  await act(async () => {
    await store.dispatch(
      sendAgentRequest({
        message: "Make a churn dashboard",
        conversation_id: convoForAgent(store).conversationId,
        assistant_message_id: "msg_dashboard_saved",
        isFullPageMetabot,
        context: {
          user_is_viewing: [],
          current_time_with_timezone: "2026-11-05T00:00:00Z",
          capabilities: [],
        },
      }),
    );
  });
  return store;
};

describe("metabot > dashboard_saved", () => {
  beforeEach(() => {
    setupEnterprisePlugins();
    mockedAiStreamingQuery.mockReset();
    mockedNavigate.mockReset();
    mockedGetRouterLocation.mockReturnValue(undefined);
    jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
  });

  afterEach(() => {
    fetchMock.removeRoutes();
  });

  it("links the dashboard, marks its charts saved and records the save", async () => {
    const store = await streamDashboardSaved(createDashboardSaved());

    expect(
      await screen.findByRole("link", { name: "Open dashboard" }),
    ).toHaveAttribute("href", "/dashboard/43");
    expect(getSavedChartCardId(store.getState(), "chart-a")).toBe(501);
    expect(getSavedDashboard(store.getState())).toEqual({
      dashboardId: 43,
      saveId: "call-1",
    });
  });

  it("opens the dashboard when the save asks for it", async () => {
    await streamDashboardSaved(createDashboardSaved());

    expect(mockedNavigate).toHaveBeenCalledWith("/dashboard/43");
  });

  it("doesn't open the dashboard the user is already viewing", async () => {
    mockedGetRouterLocation.mockReturnValue(
      viewing("/dashboard/43-churn-overview"),
    );
    await streamDashboardSaved(createDashboardSaved());

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't open the dashboard when the save doesn't ask for it", async () => {
    await streamDashboardSaved(
      createDashboardSaved({ action: "trashed", open: false }),
    );

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it("doesn't open the dashboard from full-page Metabot", async () => {
    await streamDashboardSaved(createDashboardSaved(), {
      isFullPageMetabot: true,
    });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });
});

describe("useOnMetabotDashboardSave", () => {
  const SaveProbe = ({ onSave }: { onSave: () => void }) => {
    useOnMetabotDashboardSave(42, onSave);
    return null;
  };

  const save = (dashboardId: number, saveId: string) =>
    dashboardSaved({ dashboardId, saveId });

  it("calls back once for each save of its dashboard", () => {
    const onSave = jest.fn();
    const store = setupStore(<SaveProbe onSave={onSave} />);

    act(() => {
      store.dispatch(save(42, "call-1"));
    });
    act(() => {
      store.dispatch(save(42, "call-2"));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("ignores saves of other dashboards", () => {
    const onSave = jest.fn();
    const store = setupStore(<SaveProbe onSave={onSave} />);

    act(() => {
      store.dispatch(save(43, "call-1"));
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores a save made before it mounted", () => {
    const onSave = jest.fn();
    const store = setupStore(<div />);
    act(() => {
      store.dispatch(save(42, "call-1"));
    });

    renderWithProviders(<SaveProbe onSave={onSave} />, {
      storeInitialState: store.getState(),
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
