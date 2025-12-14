import { combineReducers } from "@reduxjs/toolkit";

import { mockSettings } from "__support__/settings";
import { act, renderHookWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useMetabotConversationsManager } from "../hooks/use-metabot-conversations-manager";
import {
  type MetabotConvoId,
  getMessages,
  metabotReducer,
  submitInput,
} from "../state";
import { getMetabotInitialState } from "../state/reducer-utils";

import { mockAgentEndpoint } from "./utils";

function setup(
  options: {
    ui?: React.ReactElement;
    convoIds: MetabotConvoId[];
  } | void,
) {
  const { convoIds = ["omnibot", "inline_sql"] } = options || {};

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  const { store, result: hook } = renderHookWithProviders(
    () => useMetabotConversationsManager(convoIds),
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

  return {
    convoIds,
    store,
    hook,
  };
}

type BaseInput = Parameters<typeof submitInput>[0];
type Input = Omit<BaseInput, "message" | "convoId">;
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
    const { store } = setup({ convoIds: ["test_1", "test_2"] });

    // ACT
    mockAgentEndpoint({
      textChunks: [
        `0:"Test 1 response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
      ],
    });
    const msg1 = { ...input, message: "test1", convoId: "test_1" } as const;
    await store.dispatch(submitInput(msg1) as any);

    mockAgentEndpoint({
      textChunks: [
        `0:"Test 2 response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
      ],
    });
    const msg2 = { ...input, message: "test2", convoId: "test_2" } as const;
    await act(async () => {
      await store.dispatch(submitInput(msg2) as any);
    });

    // ASSERT
    const state = store.getState() as any;
    expect(getMessages(state, "test_1")).toMatchObject([
      { message: "test1", role: "user", type: "text" },
      { message: "Test 1 response", role: "agent", type: "text" },
    ]);
    expect(getMessages(state, "test_2")).toMatchObject([
      { message: "test2", role: "user", type: "text" },
      { message: "Test 2 response", role: "agent", type: "text" },
    ]);
  });

  it("should be able to start a conversation", () => {
    const { hook } = setup({ convoIds: [] });

    const convoId = "test_1" as const;
    expect(hook.current.activeConvoIds).not.toContain(convoId);
    act(() => hook.current.startConversation({ convoId, visible: false }));
    expect(hook.current.activeConvoIds).toContain(convoId);
  });

  it("should be able to reset a conversation", async () => {
    const { hook, store } = setup({ convoIds: ["test_1"] });
    mockAgentEndpoint({
      textChunks: [
        `0:"response"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}`,
      ],
    });
    await store.dispatch(
      submitInput({ ...input, message: "test", convoId: "test_1" }) as any,
    );
    expect(getMessages(store.getState() as any, "test_1")).toHaveLength(2);

    act(() => hook.current.resetConversation({ convoId: "test_1" }));

    expect(hook.current.activeConvoIds).toContain("test_1");
    expect(getMessages(store.getState() as any, "test_1")).toHaveLength(0);
  });

  it("should be able to remove a conversation", () => {
    const { hook } = setup({ convoIds: ["test_1"] });

    expect(hook.current.activeConvoIds).toContain("test_1");
    act(() => hook.current.removeConversation({ convoId: "test_1" }));
    expect(hook.current.activeConvoIds).not.toContain("test_1");
  });
});
