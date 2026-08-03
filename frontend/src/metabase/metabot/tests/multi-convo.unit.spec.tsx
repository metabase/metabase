import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupGetMetabotConversationTitleEndpoint } from "__support__/server-mocks";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";

import { useMetabotAgentsManager } from "../hooks";
import {
  type MetabotAgentId,
  getMessages,
  getMetabotConversationTitle,
  metabotActions,
  submitInput,
} from "../state";

import { mockAgentEndpoint } from "./utils";

const titlePath = (conversationId: string) =>
  `path:/api/metabot/conversations/${conversationId}/title`;

function setup(
  options: {
    ui?: React.ReactElement;
    agentIds: MetabotAgentId[];
  } | void,
) {
  const { agentIds = ["omnibot", "sql"] } = options || {};

  const { store: _store, result: hook } = renderHookWithProviders(
    () => useMetabotAgentsManager(agentIds),
    {},
  );

  // Unjustified type cast. FIXME
  const store = _store as Omit<typeof _store, "getState" | "dispatch"> & {
    getState: () => State;
    dispatch: ThunkDispatch<State, void, UnknownAction>;
  };

  return {
    agentIds,
    store,
    hook,
  };
}

type BaseInput = Parameters<typeof submitInput>[0];
type Input = Omit<BaseInput, "message" | "agentId">;
const input: Input = {
  type: "text",
  context: {
    user_is_viewing: [],
    current_time_with_timezone: "",
    capabilities: [],
  },
};

type TestStore = ReturnType<typeof setup>["store"];

const conversationIdFor = (store: TestStore, agentId: MetabotAgentId) =>
  checkNotNull(store.getState().metabot.conversations[agentId]).conversationId;

const sendMessage = async (
  store: TestStore,
  agentId: MetabotAgentId,
  message = "test",
) => {
  mockAgentEndpoint({
    events: [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "response" },
      { type: "text-end", id: "t1" },
    ],
  });
  await act(async () => {
    await store.dispatch(submitInput({ ...input, message, agentId }));
  });
};

describe("multi-convo support", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
  });

  it("should support being able to hold two conversations at once", async () => {
    // ARRANGE
    const { store } = setup({ agentIds: ["test_1", "test_2"] });

    // ACT
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Test 1 response" },
        { type: "text-end", id: "t1" },
        { type: "data-conversation-title", data: "T1" },
      ],
    });
    const msg1 = { ...input, message: "test1", agentId: "test_1" } as const;
    await store.dispatch(submitInput(msg1));

    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t2" },
        { type: "text-delta", id: "t2", delta: "Test 2 response" },
        { type: "text-end", id: "t2" },
        { type: "data-conversation-title", data: "T2" },
      ],
    });
    const msg2 = { ...input, message: "test2", agentId: "test_2" } as const;
    await act(async () => {
      await store.dispatch(submitInput(msg2));
    });

    // ASSERT
    const state = store.getState();
    expect(getMessages(state, "test_1")).toMatchObject([
      { message: "test1", role: "user", type: "text" },
      { message: "Test 1 response", role: "agent", type: "text" },
    ]);
    expect(getMessages(state, "test_2")).toMatchObject([
      { message: "test2", role: "user", type: "text" },
      { message: "Test 2 response", role: "agent", type: "text" },
    ]);
  });

  it("should be able to start a conversation", async () => {
    const { hook } = setup({ agentIds: [] });

    const agentId = "test_1" as const;
    expect(hook.current.activeAgentIds).not.toContain(agentId);
    await act(() => hook.current.createAgent({ agentId, visible: false }));
    expect(hook.current.activeAgentIds).toContain(agentId);
  });

  it("should be able to reset a conversation", async () => {
    const { hook, store } = setup({ agentIds: ["test_1"] });
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "response" },
        { type: "text-end", id: "t1" },
        { type: "data-conversation-title", data: "T" },
      ],
    });
    await store.dispatch(
      submitInput({ ...input, message: "test", agentId: "test_1" }),
    );
    expect(getMessages(store.getState(), "test_1")).toHaveLength(2);

    await act(() => hook.current.resetConversation({ agentId: "test_1" }));

    expect(hook.current.activeAgentIds).toContain("test_1");
    expect(getMessages(store.getState(), "test_1")).toHaveLength(0);
  });

  it("should be able to remove a conversation", async () => {
    const { hook } = setup({ agentIds: ["test_1"] });

    expect(hook.current.activeAgentIds).toContain("test_1");
    await act(() => hook.current.destroyAgent({ agentId: "test_1" }));
    expect(hook.current.activeAgentIds).not.toContain("test_1");
  });

  it("does not poll for a title on a profile without title UI", async () => {
    setupGetMetabotConversationTitleEndpoint({
      status: "pending",
      title: null,
    });
    const { store } = setup({ agentIds: ["sql"] });
    const conversationId = conversationIdFor(store, "sql");

    await sendMessage(store, "sql", "fix my sql");

    expect(getMessages(store.getState(), "sql")).toHaveLength(2);
    expect(fetchMock.callHistory.calls(titlePath(conversationId))).toHaveLength(
      0,
    );
  });

  it("does not start a second title poll while one is already in flight", async () => {
    setupGetMetabotConversationTitleEndpoint({
      status: "pending",
      title: null,
    });
    const { store } = setup({ agentIds: ["test_1"] });
    const conversationId = conversationIdFor(store, "test_1");
    store.dispatch(
      metabotActions.setIsPollingForTitle({
        conversationId,
        isPollingForTitle: true,
      }),
    );

    await sendMessage(store, "test_1");

    expect(getMessages(store.getState(), "test_1")).toHaveLength(2);
    expect(fetchMock.callHistory.calls(titlePath(conversationId))).toHaveLength(
      0,
    );
  });

  it("keeps polling when a node reports the title as missing", async () => {
    jest.useFakeTimers({ advanceTimers: true });

    let callCount = 0;
    fetchMock.removeRoute("metabot-conversation-title");
    fetchMock.get(
      "express:/api/metabot/conversations/:conversationId/title",
      () => {
        callCount += 1;
        return callCount === 1
          ? { status: "missing", title: null }
          : { status: "ready", title: "A late title" };
      },
      { name: "metabot-conversation-title" },
    );

    const { store } = setup({ agentIds: ["test_1"] });

    await sendMessage(store, "test_1");

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() =>
      expect(getMetabotConversationTitle(store.getState(), "test_1")).toBe(
        "A late title",
      ),
    );

    jest.useRealTimers();
  });

  it("starts a title poll while an unrelated conversation's poll is in flight", async () => {
    setupGetMetabotConversationTitleEndpoint({
      status: "ready",
      title: "A title",
    });
    const { store } = setup({ agentIds: ["test_1"] });
    const conversationId = conversationIdFor(store, "test_1");
    store.dispatch(
      metabotActions.setIsPollingForTitle({
        conversationId: "a-conversation-the-agent-has-left",
        isPollingForTitle: true,
      }),
    );

    await sendMessage(store, "test_1");

    expect(fetchMock.callHistory.calls(titlePath(conversationId))).toHaveLength(
      1,
    );
  });
});
