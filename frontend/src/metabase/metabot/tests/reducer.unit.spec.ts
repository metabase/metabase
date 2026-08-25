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
import { LOCATION_CHANGE } from "metabase/router";
import type { MetabotSuggestedTransform } from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks/transform";

import { METABOT_PROFILE_OVERRIDES } from "../constants";
import {
  createConversation,
  getMetabotInitialState,
  getRequestConversation,
} from "../state/reducer-utils";

import {
  conversationIdForAgent,
  convoForAgent,
  createTestMetabotState,
  testConversationId,
} from "./utils";

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
      metabot: { ...createTestMetabotState(), ...initialState },
    },
  });

const requestAction = (arg: Partial<{ conversation_id: string }> = {}) => ({
  meta: { arg: { conversation_id: "matching-id", ...arg } },
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

  describe("agents and conversations", () => {
    it("seeds each agent with its own conversation record", () => {
      const state = getMetabotInitialState();
      const conversationIds = Object.values(state.agents).map(
        (agent) => agent?.conversationId,
      );

      expect(new Set(conversationIds).size).toBe(conversationIds.length);
      conversationIds.forEach((id) =>
        expect(state.conversations[id!]).toBeDefined(),
      );
    });

    it("re-applies the agent's profile default when it opens a new conversation", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.startNewConversation({ agentId: "sql" }));

      expect(convoForAgent(store, "sql").profileOverride).toBe(
        METABOT_PROFILE_OVERRIDES.SQL,
      );
    });

    it("applies the agent's profile default to a conversation it attaches to", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.attachAgentToConversation({
          agentId: "ask",
          conversationId: "convo-from-url",
        }),
      );

      expect(convoForAgent(store, "ask")).toMatchObject({
        conversationId: "convo-from-url",
        profileOverride: METABOT_PROFILE_OVERRIDES.NLQ,
      });
    });

    it("evicts a conversation an agent walked away from without using", () => {
      const store = createTestStore();
      const abandoned = conversationIdForAgent(store, "omnibot");

      store.dispatch(
        metabotActions.startNewConversation({ agentId: "omnibot" }),
      );

      expect(store.getState().metabot.conversations[abandoned]).toBeUndefined();
    });

    it("keeps a conversation another agent still points at", () => {
      const store = createTestStore();
      const shared = conversationIdForAgent(store, "omnibot");
      store.dispatch(
        metabotActions.attachAgentToConversation({
          agentId: "sql",
          conversationId: shared,
        }),
      );

      store.dispatch(
        metabotActions.startNewConversation({ agentId: "omnibot" }),
      );

      expect(store.getState().metabot.conversations[shared]).toBeDefined();
    });

    it("does not keep a conversation when a snapshot arrives after every agent has moved on", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.attachAgentToConversation({
          agentId: "ask",
          conversationId: "convo-a",
        }),
      );
      store.dispatch(
        metabotActions.attachAgentToConversation({
          agentId: "ask",
          conversationId: "convo-b",
        }),
      );

      // the fetch kicked off by loadConversation("convo-a") lands after the
      // agent already walked away, e.g. two rapid history selections
      store.dispatch(
        metabotActions.setConversationSnapshot({
          conversationId: "convo-a",
          messages: [],
        }),
      );

      expect(store.getState().metabot.conversations["convo-a"]).toBeUndefined();
    });

    it("keeps an abandoned conversation that was written to this session", () => {
      const store = createTestStore();
      const abandoned = conversationIdForAgent(store, "omnibot");
      store.dispatch(
        metabotActions.addUserMessage({
          conversationId: abandoned,
          id: "u1",
          type: "text",
          message: "hi",
        }),
      );

      store.dispatch(
        metabotActions.startNewConversation({ agentId: "omnibot" }),
      );

      expect(store.getState().metabot.conversations[abandoned]).toBeDefined();
    });
  });

  describe("location changes", () => {
    const locationChange = (pathname: string) => ({
      type: LOCATION_CHANGE,
      payload: { pathname, search: "", hash: "", state: undefined, key: "t" },
    });

    it("attaches the ask agent to the conversation in the URL", () => {
      const store = createTestStore();
      store.dispatch(locationChange("/metabot/conversation/convo-from-url"));

      expect(conversationIdForAgent(store, "ask")).toBe("convo-from-url");
      expect(
        store.getState().metabot.conversations["convo-from-url"],
      ).toBeDefined();
    });

    it("starts a fresh ask conversation on each navigation to the ask page", () => {
      const store = createTestStore();
      const seeded = conversationIdForAgent(store, "ask");

      store.dispatch(locationChange("/question/ask"));
      const first = conversationIdForAgent(store, "ask");
      expect(first).not.toBe(seeded);

      store.dispatch(locationChange("/question/ask"));
      expect(conversationIdForAgent(store, "ask")).not.toBe(first);
    });

    it("leaves the ask agent alone on unrelated routes", () => {
      const store = createTestStore();
      const seeded = conversationIdForAgent(store, "ask");

      store.dispatch(locationChange("/dashboard/1"));

      expect(conversationIdForAgent(store, "ask")).toBe(seeded);
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
      state.conversations["stored-id"] = createDraft(
        createConversation({ conversationId: "stored-id" }),
      );
      expect(
        getRequestConversation(
          state,
          requestAction({ conversation_id: "different-id" }),
        ),
      ).toBeUndefined();
    });

    it("should return the conversation the request targets", () => {
      const state = createDraft(getMetabotInitialState());
      const convo = createDraft(
        createConversation({ conversationId: "matching-id" }),
      );
      state.conversations["matching-id"] = convo;
      expect(getRequestConversation(state, requestAction())).toBe(convo);
    });
  });

  describe("tool calls", () => {
    const conversationId = testConversationId("omnibot");
    const getToolCallMessages = (store: ReturnType<typeof createTestStore>) =>
      convoForAgent(store, "omnibot").messages.filter(
        (m) => m.type === "tool_call",
      );

    it("toolCallStart is idempotent for the same toolCallId", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );

      const convo = convoForAgent(store, "omnibot");
      expect(getToolCallMessages(store)).toHaveLength(1);
      expect(convo?.activeToolCalls).toHaveLength(1);
    });

    it("toolCallArgs updates the existing tool-call message when toolCallStart preceded it", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallArgs({
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
          args: '{"foo":1}',
        }),
      );

      const convo = convoForAgent(store, "omnibot");
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
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
          args: '{"foo":1}',
        }),
      );

      const convo = convoForAgent(store, "omnibot");
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
          conversationId,
          toolCallId: "x",
          toolName: "analyze_data",
        }),
      );
      store.dispatch(
        metabotActions.toolCallEnd({
          conversationId,
          toolCallId: "x",
          result: "boom",
          isError: true,
        }),
      );

      const convo = convoForAgent(store, "omnibot");
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
    const conversationId = testConversationId("omnibot");
    const getConvo = (store: ReturnType<typeof createTestStore>) =>
      convoForAgent(store, "omnibot");
    const getChain = (store: ReturnType<typeof createTestStore>) =>
      getConvo(store).messages.find((m) => m.type === "chain_of_thought");

    it("accumulates reasoning deltas into one chain step", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      store.dispatch(
        metabotActions.reasoningDelta({ conversationId, text: "Think" }),
      );
      store.dispatch(
        metabotActions.reasoningDelta({ conversationId, text: "ing" }),
      );

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        { kind: "reasoning", text: "Thinking" },
      ]);
      expect(getConvo(store)?.activeChainId).toBe(chain?.id);
    });

    it("interleaves tool calls between reasoning blocks in order", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      store.dispatch(
        metabotActions.reasoningDelta({ conversationId, text: "look" }),
      );
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      store.dispatch(
        metabotActions.reasoningDelta({ conversationId, text: "now" }),
      );

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
          conversationId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(
        metabotActions.toolCallEnd({
          conversationId,
          toolCallId: "t1",
          result: "ok",
        }),
      );

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        { kind: "tool", id: "t1", name: "search", status: "ended" },
      ]);
    });

    it("persists the chain but closes it when the answer text starts", () => {
      const store = createTestStore();
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      store.dispatch(
        metabotActions.reasoningDelta({ conversationId, text: "hmm" }),
      );
      store.dispatch(
        metabotActions.addAgentTextDelta({ conversationId, text: "hi" }),
      );

      // the chain message stays in history, and its id is released
      expect(getChain(store)).toBeDefined();
      expect(getConvo(store)?.activeChainId).toBeUndefined();

      // later reasoning starts a fresh chain after the answer text
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      const chains = getConvo(store)?.messages.filter(
        (m) => m.type === "chain_of_thought",
      );
      expect(chains).toHaveLength(2);
    });

    it("attaches search results to their tool step, even after the chain closed", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(
        metabotActions.addAgentTextDelta({ conversationId, text: "hi" }),
      );
      store.dispatch(
        metabotActions.toolCallSearchResults({
          conversationId,
          toolCallId: "t1",
          totalCount: 1,
          results: [{ id: 1, type: "table", name: "orders" }],
        }),
      );

      const chain = getChain(store);
      expect(
        chain?.type === "chain_of_thought" && chain.steps[0],
      ).toMatchObject({ kind: "tool", searchResults: { totalCount: 1 } });
    });

    it("stamps a save_entity step title from its saved-entity data part", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "t1",
          toolName: "save_entity",
        }),
      );
      store.dispatch(
        metabotActions.addAgentTextDelta({ conversationId, text: "hi" }),
      );
      // the saved card's link only exists once the tool finishes
      store.dispatch(
        metabotActions.toolCallTitled({
          conversationId,
          toolCallId: "t1",
          title: "[Sales by Month](metabase://question/5)",
        }),
      );

      const chain = getChain(store);
      expect(
        chain?.type === "chain_of_thought" && chain.steps[0],
      ).toMatchObject({
        kind: "tool",
        name: "save_entity",
        title: "[Sales by Month](metabase://question/5)",
      });
    });

    it("backfills a title arriving on tool-input-available", () => {
      const store = createTestStore();
      store.dispatch(
        metabotActions.toolCallStart({
          conversationId,
          toolCallId: "t1",
          toolName: "search",
        }),
      );
      store.dispatch(
        metabotActions.toolCallArgs({
          conversationId,
          toolCallId: "t1",
          toolName: "search",
          title: "Searching revenue",
          args: "{}",
        }),
      );

      const chain = getChain(store);
      expect(chain?.type === "chain_of_thought" && chain.steps).toEqual([
        expect.objectContaining({ kind: "tool", title: "Searching revenue" }),
      ]);
    });

    it("releases the active chain id and context usage when a snapshot replaces the conversation", () => {
      const store = createTestStore({
        conversations: {
          ...createTestMetabotState().conversations,
          [conversationId]: createConversation({
            conversationId,
            lastTokenUsage: { contextTokens: 950, contextWindowTokens: 1000 },
          }),
        },
      });
      store.dispatch(metabotActions.reasoningStart({ conversationId }));
      store.dispatch(
        metabotActions.setConversationSnapshot({
          conversationId,
          messages: [],
        }),
      );

      expect(getConvo(store)?.activeChainId).toBeUndefined();
      expect(getConvo(store)?.lastTokenUsage).toBeUndefined();
    });
  });
});
