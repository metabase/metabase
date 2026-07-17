import { configureStore } from "@reduxjs/toolkit";
import { createDraft } from "immer";

import {
  type MetabotState,
  activateSuggestedTransform,
  addSuggestedTransform,
  deactivateSuggestedTransform,
  metabotActions,
  metabotReducer,
} from "metabase/metabot/state";
import type { MetabotSuggestedTransform } from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks/transform";

import { METABOT_PROFILE_OVERRIDES } from "../constants";
import {
  createConversation,
  getMetabotInitialState,
  getRequestConversation,
} from "../state/reducer-utils";

const createMockSuggestedTransform = (
  overrides: Partial<MetabotSuggestedTransform>,
): MetabotSuggestedTransform => ({
  ...createMockTransform(),
  active: false,
  suggestionId: "suggestion-123",
  ...overrides,
});

const createTestStore = (initialState?: Partial<MetabotState>) =>
  configureStore({
    reducer: {
      metabot: metabotReducer,
    },
    preloadedState: {
      metabot: { ...getMetabotInitialState(), ...initialState },
    },
  });

const requestAction = (
  arg: Partial<{
    agentId: "test_1";
    conversation_id: string;
    loadId: string;
  }> = {},
) => ({
  meta: {
    arg: {
      agentId: "test_1" as const,
      conversation_id: "matching-id",
      loadId: "load-1",
      ...arg,
    },
  },
});

describe("metabot reducer", () => {
  describe("transforms", () => {
    describe("addSuggestedTransform", () => {
      it("should add a new suggested transform to the state", () => {
        const store = createTestStore();
        const transform = createMockSuggestedTransform({
          id: 1,
          active: true,
        });

        store.dispatch(addSuggestedTransform(transform));

        const state = store.getState().metabot;
        expect(state.reactions.suggestedTransforms).toHaveLength(1);
        expect(state.reactions.suggestedTransforms).toContain(transform);
      });

      it("should mark existing transforms with same ID as inactive when adding new one", () => {
        const existingTransform = createMockSuggestedTransform({
          id: 1,
          active: true,
          suggestionId: "old-suggestion",
        });
        const store = createTestStore({
          reactions: {
            navigateToPath: null,
            suggestedCodeEdits: {},
            suggestedTransforms: [existingTransform],
          },
        });

        const newTransform = createMockSuggestedTransform({
          id: 1,
          active: true,
          suggestionId: "new-suggestion",
        });

        store.dispatch(addSuggestedTransform(newTransform));
        const state = store.getState().metabot;

        expect(state.reactions.suggestedTransforms).toEqual([
          expect.objectContaining({
            suggestionId: "old-suggestion",
            active: false,
          }),
          expect.objectContaining({
            suggestionId: "new-suggestion",
            active: true,
          }),
        ]);
      });
    });

    describe("activateSuggestedTransform", () => {
      it("should activate only the transform with matching suggestionId and deactivate others with same ID", () => {
        const transform1 = createMockSuggestedTransform({
          id: 1,
          active: false,
          suggestionId: "suggestion-1",
        });
        const transform2 = createMockSuggestedTransform({
          id: 1,
          active: true,
          suggestionId: "suggestion-2",
        });
        const transform3 = createMockSuggestedTransform({
          id: 2,
          active: true,
          suggestionId: "suggestion-3",
        });
        const store = createTestStore({
          reactions: {
            navigateToPath: null,
            suggestedCodeEdits: {},
            suggestedTransforms: [transform1, transform2, transform3],
          },
        });

        store.dispatch(
          activateSuggestedTransform({
            id: 1,
            suggestionId: "suggestion-1",
          }),
        );
        expect(store.getState().metabot.reactions.suggestedTransforms).toEqual([
          expect.objectContaining({
            suggestionId: "suggestion-1",
            active: true,
          }),
          expect.objectContaining({
            suggestionId: "suggestion-2",
            active: false,
          }),
          expect.objectContaining({
            suggestionId: "suggestion-3",
            active: true,
          }),
        ]);
      });

      it("should handle new transforms gracefully", () => {
        const newTransform = createMockSuggestedTransform({
          id: undefined,
          active: false,
          suggestionId: "new-suggestion",
        });
        const store = createTestStore({
          reactions: {
            navigateToPath: null,
            suggestedCodeEdits: {},
            suggestedTransforms: [newTransform],
          },
        });

        store.dispatch(
          activateSuggestedTransform({
            id: undefined,
            suggestionId: "new-suggestion",
          }),
        );
        expect(store.getState().metabot.reactions.suggestedTransforms).toEqual([
          expect.objectContaining({
            suggestionId: "new-suggestion",
            active: true,
          }),
        ]);
      });
    });

    describe("deactivateSuggestedTransform", () => {
      it("should deactivate all transforms with matching ID without affecting others", () => {
        const transform1 = createMockSuggestedTransform({
          id: 1,
          active: true,
          suggestionId: "suggestion-1",
        });
        const transform2 = createMockSuggestedTransform({
          id: 1,
          active: true,
          suggestionId: "suggestion-2",
        });
        const transform3 = createMockSuggestedTransform({
          id: 2,
          active: true,
          suggestionId: "suggestion-3",
        });
        const store = createTestStore({
          reactions: {
            navigateToPath: null,
            suggestedCodeEdits: {},
            suggestedTransforms: [transform1, transform2, transform3],
          },
        });

        store.dispatch(deactivateSuggestedTransform(1));
        const state = store.getState().metabot;

        expect(state.reactions.suggestedTransforms).toEqual([
          expect.objectContaining({
            suggestionId: "suggestion-1",
            active: false,
          }),
          expect.objectContaining({
            suggestionId: "suggestion-2",
            active: false,
          }),
          expect.objectContaining({
            suggestionId: "suggestion-3",
            active: true,
          }),
        ]);
      });

      it("should handle new transforms gracefully", () => {
        const newTransform = createMockSuggestedTransform({
          id: undefined,
          active: true,
          suggestionId: "new-suggestion",
        });
        const store = createTestStore({
          reactions: {
            navigateToPath: null,
            suggestedCodeEdits: {},
            suggestedTransforms: [newTransform],
          },
        });

        store.dispatch(deactivateSuggestedTransform(undefined));

        expect(store.getState().metabot.reactions.suggestedTransforms).toEqual([
          expect.objectContaining({
            suggestionId: "new-suggestion",
            active: false,
          }),
        ]);
      });
    });
  });

  describe("the full-page `ask` conversation", () => {
    it("exists in the initial state with the nlq profile", () => {
      const state = getMetabotInitialState();
      expect(state.conversations.ask).toBeDefined();
      expect(state.conversations.ask?.profileOverride).toBe(
        METABOT_PROFILE_OVERRIDES.NLQ,
      );
    });

    it("can be reset independently and keeps the nlq profile", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.resetConversation({ agentId: "ask" }));
      const convo = store.getState().metabot.conversations.ask;
      expect(convo).toBeDefined();
      expect(convo?.profileOverride).toBe(METABOT_PROFILE_OVERRIDES.NLQ);
    });
  });

  describe("getRequestConversation", () => {
    it("should return undefined if no matching convo", () => {
      const state = createDraft(getMetabotInitialState());

      expect(
        getRequestConversation(
          state,
          requestAction({ conversation_id: "some-id" }),
        ),
      ).toBeUndefined();
    });

    it("should return undefined if the conversation's conversation_id doesn't match the value in the store", () => {
      const state = createDraft(getMetabotInitialState());
      state.conversations.test_1 = createDraft(
        createConversation("test_1", { conversationId: "stored-id" }),
      );
      expect(
        getRequestConversation(
          state,
          requestAction({ conversation_id: "different-id" }),
        ),
      ).toBeUndefined();
    });

    it("should return undefined if the conversation was reloaded since the request started", () => {
      const state = createDraft(getMetabotInitialState());
      state.conversations.test_1 = createDraft(
        createConversation("test_1", {
          conversationId: "matching-id",
          loadId: "load-2",
        }),
      );
      expect(getRequestConversation(state, requestAction())).toBeUndefined();
    });

    it("should return conversation if agentId, request conversation_id and loadId match", () => {
      const state = createDraft(getMetabotInitialState());
      const convo = createDraft(
        createConversation("test_1", {
          conversationId: "matching-id",
          loadId: "load-1",
        }),
      );
      state.conversations.test_1 = convo;
      expect(getRequestConversation(state, requestAction())).toBe(convo);
    });
  });

  describe("tool calls", () => {
    const agentId = "omnibot" as const;
    const getToolCallMessages = (store: ReturnType<typeof createTestStore>) =>
      store
        .getState()
        .metabot.conversations.omnibot?.messages.filter(
          (m) => m.type === "tool_call",
        );

    it("toolCallStart is idempotent for the same toolCallId", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );

      const convo = store.getState().metabot.conversations.omnibot;
      expect(getToolCallMessages(store)).toHaveLength(1);
      expect(convo?.activeToolCalls).toHaveLength(1);
    });

    it("toolCallArgs updates the existing tool-call message when toolCallStart preceded it", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallArgs({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
          args: '{"foo":1}',
        }),
      );

      const convo = store.getState().metabot.conversations.omnibot;
      expect(getToolCallMessages(store)).toEqual([
        expect.objectContaining({
          id: "x",
          type: "tool_call",
          args: '{"foo":1}',
          status: "started",
        }),
      ]);
      expect(convo?.activeToolCalls).toHaveLength(1);
    });

    it("toolCallArgs creates a tool-call message when no tool-input-start preceded it", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallArgs({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
          args: '{"foo":1}',
        }),
      );

      const convo = store.getState().metabot.conversations.omnibot;
      expect(getToolCallMessages(store)).toEqual([
        expect.objectContaining({
          id: "x",
          type: "tool_call",
          args: '{"foo":1}',
          status: "started",
        }),
      ]);
      expect(convo?.activeToolCalls).toHaveLength(1);
    });

    it("toolCallEnd marks the tool-call message as errored", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallEnd({
          agentId,
          toolCallId: "x",
          result: "boom",
          isError: true,
        }),
      );

      const convo = store.getState().metabot.conversations.omnibot;
      expect(getToolCallMessages(store)).toEqual([
        expect.objectContaining({
          id: "x",
          type: "tool_call",
          status: "ended",
          result: "boom",
          is_error: true,
        }),
      ]);
      expect(convo?.activeToolCalls).toEqual([
        expect.objectContaining({ id: "x", status: "ended" }),
      ]);
    });
  });

  describe("chain of thought", () => {
    const agentId = "omnibot" as const;
    const getConvo = (store: ReturnType<typeof createTestStore>) =>
      store.getState().metabot.conversations.omnibot;
    const getChain = (store: ReturnType<typeof createTestStore>) =>
      getConvo(store)?.messages.find((m) => m.type === "chain_of_thought");

    it("accumulates reasoning deltas into one chain step", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      store.dispatch(metabotActions.reasoningDelta({ agentId, text: "Think" }));
      store.dispatch(metabotActions.reasoningDelta({ agentId, text: "ing" }));

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        { kind: "reasoning", text: "Thinking" },
      ]);
      expect(getConvo(store)?.activeChainId).toBe(chain?.id);
    });

    it("interleaves tool calls between reasoning blocks in order", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      store.dispatch(metabotActions.reasoningDelta({ agentId, text: "look" }));
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      store.dispatch(metabotActions.reasoningDelta({ agentId, text: "now" }));

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        { kind: "reasoning", text: "look" },
        { kind: "tool", id: "t1", name: "search", status: "started" },
        { kind: "reasoning", text: "now" },
      ]);
    });

    it("marks a tool step ended when its result arrives", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          agentId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(
        metabotActions.toolCallEnd({ agentId, toolCallId: "t1", result: "ok" }),
      );

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        { kind: "tool", id: "t1", name: "search", status: "ended" },
      ]);
    });

    it("persists the chain but closes it when the answer text starts", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      store.dispatch(metabotActions.reasoningDelta({ agentId, text: "hmm" }));
      store.dispatch(metabotActions.addAgentTextDelta({ agentId, text: "hi" }));

      // the chain message stays in history, and its id is released
      expect(getChain(store)).toBeDefined();
      expect(getConvo(store)?.activeChainId).toBeUndefined();

      // later reasoning starts a fresh chain after the answer text
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      const chains = getConvo(store)?.messages.filter(
        (m) => m.type === "chain_of_thought",
      );
      expect(chains).toHaveLength(2);
    });

    it("keeps the chain in history but releases the id after a snapshot load", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ agentId }));
      store.dispatch(
        metabotActions.setConversationSnapshot({
          agentId,
          conversationId: "snap-1",
          messages: [],
        }),
      );

      expect(getConvo(store)?.activeChainId).toBeUndefined();
    });
  });
});
