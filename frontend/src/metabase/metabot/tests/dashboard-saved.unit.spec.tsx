import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { useListCollectionItemsQuery } from "metabase/api";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type { DashboardSavedValue } from "metabase/api/ai-streaming/schemas";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { State } from "metabase/redux/store";
import {
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";
import { useOnMetabotDashboardSave } from "../hooks/use-on-metabot-dashboard-save";
import { dashboardSaved } from "../state";
import { sendAgentRequest } from "../state/actions";
import { getDashboardSaveId, getSavedChartCardId } from "../state/selectors";

import { convoForAgent, createTestMetabotState } from "./utils";

jest.mock("metabase/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

// the turn ends by opening the saved dashboard, which these tests don't follow
jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  navigate: jest.fn(),
}));

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);

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

const CollectionItemsProbe = () => {
  useListCollectionItemsQuery({ id: 31 });
  return null;
};

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
  {
    store = setupStore(<ChatMessagesProbe />),
  }: {
    store?: ReturnType<typeof setupStore>;
  } = {},
) => {
  mockedAiStreamingQuery.mockImplementation(async (_request, callbacks) => {
    callbacks?.onStart?.({ type: "start", messageId: "msg_dashboard_saved" });
    callbacks?.onDataPart?.({ type: "data-dashboard_saved", data: value });
    return { aborted: false, toolCalls: [], data: [] };
  });

  await act(async () => {
    await store.dispatch(
      sendAgentRequest({
        message: "Make a churn dashboard",
        conversation_id: convoForAgent(store).conversationId,
        assistant_message_id: "msg_dashboard_saved",
        isFullPageMetabot: false,
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
    expect(getDashboardSaveId(store.getState(), 43)).toBe("call-1");
  });

  it("refetches the dashboard's collection", async () => {
    setupCollectionItemsEndpoint({
      collection: { id: 31 },
      collectionItems: [],
    });
    const itemsFetches = () =>
      fetchMock.callHistory.calls("path:/api/collection/31/items").length;
    const store = setupStore(<CollectionItemsProbe />);
    await waitFor(() => expect(itemsFetches()).toBe(1));

    await streamDashboardSaved(createDashboardSaved(), { store });

    await waitFor(() => expect(itemsFetches()).toBe(2));
  });
});

describe("useOnMetabotDashboardSave", () => {
  // shows dashboard 42 until "Switch" moves it to dashboard 43
  const SaveProbe = ({ onSave }: { onSave: () => void }) => {
    const [dashboardId, setDashboardId] = useState(42);
    useOnMetabotDashboardSave(dashboardId, onSave);
    return <button onClick={() => setDashboardId(43)}>Switch</button>;
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

  it("sees its save when a save of another dashboard follows in the same tick", () => {
    const onSave = jest.fn();
    const store = setupStore(<SaveProbe onSave={onSave} />);

    act(() => {
      store.dispatch(save(42, "call-1"));
      store.dispatch(save(43, "call-2"));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("ignores saves of other dashboards", () => {
    const onSave = jest.fn();
    const store = setupStore(<SaveProbe onSave={onSave} />);

    act(() => {
      store.dispatch(save(43, "call-1"));
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores an earlier save of a dashboard it switches to", async () => {
    const onSave = jest.fn();
    const store = setupStore(<SaveProbe onSave={onSave} />);
    act(() => {
      store.dispatch(save(43, "call-1"));
    });

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));

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
