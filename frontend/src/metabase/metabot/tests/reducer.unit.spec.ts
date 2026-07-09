import { configureStore } from "@reduxjs/toolkit";
import { createDraft } from "immer";

import { waitFor } from "__support__/ui";
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

import { enterChatMessage, mockAgentEndpoint, setup } from "./utils";

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

  describe("streamed conversation title", () => {
    it("stores the title on the conversation", async () => {
      const { store } = setup();
      mockAgentEndpoint({
        events: [{ type: "data-chat-title", data: "Orders by Month" }],
      });

      await enterChatMessage("Show orders by month");

      await waitFor(() => {
        expect(store.getState().metabot.conversations.omnibot?.title).toBe(
          "Orders by Month",
        );
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

  describe("tool calls", () => {
    const agentId = "omnibot" as const;

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
      expect(convo?.messages).toHaveLength(1);
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
      expect(convo?.messages).toEqual([
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
      expect(convo?.messages).toEqual([
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
      expect(convo?.messages).toEqual([
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
});
