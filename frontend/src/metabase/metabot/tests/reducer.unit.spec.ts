import { configureStore } from "@reduxjs/toolkit";
import { createDraft } from "immer";

import {
  type MetabotAgentId,
  type MetabotChatMessage,
  type MetabotState,
  activateSuggestedTransform,
  addSuggestedTransform,
  deactivateSuggestedTransform,
  forkConversation,
  getMetabotState,
  metabotReducer,
} from "metabase/metabot/state";
import type {
  MetabotHistory,
  MetabotSuggestedTransform,
} from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks/transform";

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
            currentQuestionPath: null,
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
            currentQuestionPath: null,
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
            currentQuestionPath: null,
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
            currentQuestionPath: null,
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
            currentQuestionPath: null,
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

  describe("getRequestConversation", () => {
    it("should return undefined if no matching convo", () => {
      const state = createDraft(getMetabotInitialState());
      const action = {
        meta: {
          arg: { agentId: "test_1" as const, conversation_id: "some-id" },
        },
      };

      expect(getRequestConversation(state, action)).toBeUndefined();
    });

    it("should return undefined if the conversation's conversation_id doesn't match the value in the store", () => {
      const state = createDraft(getMetabotInitialState());
      state.conversations.test_1 = createDraft(
        createConversation("test_1", { conversationId: "stored-id" }),
      );
      const action = {
        meta: {
          arg: { agentId: "test_1" as const, conversation_id: "different-id" },
        },
      };

      expect(getRequestConversation(state, action)).toBeUndefined();
    });

    it("should return conversation if agentId and request conversation_id match", () => {
      const state = createDraft(getMetabotInitialState());
      const convo = createDraft(
        createConversation("test_1", { conversationId: "matching-id" }),
      );
      state.conversations.test_1 = convo;
      const action = {
        meta: {
          arg: { agentId: "test_1" as const, conversation_id: "matching-id" },
        },
      };

      expect(getRequestConversation(state, action)).toBe(convo);
    });
  });

  describe("forkConversation", () => {
    const SOURCE_AGENT_ID: MetabotAgentId = "chat_source";

    const SOURCE_MESSAGES: MetabotChatMessage[] = [
      { id: "u1", role: "user", type: "text", message: "q1" },
      {
        id: "a1",
        role: "agent",
        type: "text",
        message: "r1",
        externalId: "e1",
      },
      { id: "u2", role: "user", type: "text", message: "q2" },
      {
        id: "a2",
        role: "agent",
        type: "text",
        message: "r2",
        externalId: "e2",
      },
    ];

    const SOURCE_HISTORY: MetabotHistory = [
      { id: "u1", role: "user", content: "q1" },
      { role: "assistant", content: "r1" },
      { id: "u2", role: "user", content: "q2" },
      { role: "assistant", content: "r2" },
    ];

    const createForkStore = () => {
      const store = configureStore({
        reducer: {
          metabot: metabotReducer,
          // forkConversation -> setVisible reads the current user
          currentUser: (state = { id: 1 }) => state,
        },
      });
      store.dispatch({
        type: "metabase/metabot/hydrateChatConversation",
        payload: {
          agentId: SOURCE_AGENT_ID,
          conversationId: "source-convo-id",
          title: "My chat",
          messages: SOURCE_MESSAGES,
          history: SOURCE_HISTORY,
          state: { foo: "bar" },
        },
      });
      store.dispatch({
        type: "metabase/metabot/setVisible",
        payload: { agentId: SOURCE_AGENT_ID, visible: true },
      });
      return store;
    };

    it("branches up to and including the forked message and titles the fork", async () => {
      const store = createForkStore();

      const { agentId: forkAgentId } = await store
        .dispatch(
          forkConversation({ agentId: SOURCE_AGENT_ID, messageId: "a1" }),
        )
        .unwrap();

      const convos = getMetabotState(store.getState() as any).conversations;
      const fork = convos[forkAgentId]!;

      expect(forkAgentId).not.toBe(SOURCE_AGENT_ID);
      expect(forkAgentId.startsWith("chat_")).toBe(true);
      expect(fork.title).toBe("My chat (forked)");
      // only the first turn is carried over
      expect(fork.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
      // history is cut on the turn boundary (before the next user entry)
      expect(fork.history).toEqual([
        { id: "u1", role: "user", content: "q1" },
        { role: "assistant", content: "r1" },
      ]);
      expect(fork.state).toEqual({ foo: "bar" });
      // the fork gets its own conversation id and is opened
      expect(fork.conversationId).not.toBe("source-convo-id");
      expect(fork.visible).toBe(true);
    });

    it("keeps the full conversation when forking from the last turn", async () => {
      const store = createForkStore();

      const { agentId: forkAgentId } = await store
        .dispatch(
          forkConversation({ agentId: SOURCE_AGENT_ID, messageId: "a2" }),
        )
        .unwrap();

      const convos = getMetabotState(store.getState() as any).conversations;
      const fork = convos[forkAgentId]!;

      expect(fork.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
      expect(fork.history).toEqual(SOURCE_HISTORY);
    });

    it("leaves the source conversation untouched but minimized", async () => {
      const store = createForkStore();

      await store
        .dispatch(
          forkConversation({ agentId: SOURCE_AGENT_ID, messageId: "a1" }),
        )
        .unwrap();

      const source = getMetabotState(store.getState() as any).conversations[
        SOURCE_AGENT_ID
      ]!;
      expect(source.messages.map((m) => m.id)).toEqual([
        "u1",
        "a1",
        "u2",
        "a2",
      ]);
      expect(source.title).toBe("My chat");
      // the original stays available as a background tab
      expect(source.visible).toBe(false);
    });
  });
});
