import type { AnyAction, ThunkDispatch } from "@reduxjs/toolkit";
import { combineReducers } from "@reduxjs/toolkit";

import { mockSettings } from "__support__/settings";
import { act, renderHookWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useMetabotAgentsManager } from "../hooks";
import {
  type MetabotAgentId,
  type MetabotStoreState,
  getMessages,
  metabotReducer,
  submitInput,
} from "../state";
import { getMetabotInitialState } from "../state/reducer-utils";

import { mockAgentEndpoint } from "./utils";

function setup(
  options: {
    ui?: React.ReactElement;
    agentIds: MetabotAgentId[];
  } | void,
) {
  const { agentIds = ["omnibot", "sql"] } = options || {};

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  const { store: _store, result: hook } = renderHookWithProviders(
    () => useMetabotAgentsManager(agentIds),
    {
      storeInitialState: createMockState({
        settings,
        plugins: {
          metabotPlugin: getMetabotInitialState(),
        },
      } as any),
      customReducers: {
        plugins: combineReducers({
          metabotPlugin: metabotReducer,
        }),
      },
    },
  );

  const store = _store as Omit<typeof _store, "getState" | "dispatch"> & {
    getState: () => MetabotStoreState;
    dispatch: ThunkDispatch<MetabotStoreState, void, AnyAction>;
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

describe("multi-convo support", () => {
  it("should support being able to hold two conversations at once", async () => {
    // ARRANGE
    const { store } = setup({ agentIds: ["test_1", "test_2"] });

    // ACT
    mockAgentEndpoint({
      textChunks: [
        `0:"Test 1 response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
      ],
    });
    const msg1 = { ...input, message: "test1", agentId: "test_1" } as const;
    await store.dispatch(submitInput(msg1));

    mockAgentEndpoint({
      textChunks: [
        `0:"Test 2 response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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
      textChunks: [
        `0:"response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}`,
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
});
