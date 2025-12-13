import { configureStore } from "@reduxjs/toolkit";

import {
  type MetabotState,
  type MetabotSuggestedTransform,
  activateSuggestedTransform,
  addSuggestedTransform,
  deactivateSuggestedTransform,
  getMetabotInitialState,
  metabotReducer,
} from "metabase-enterprise/metabot/state";
import { createMockTransform } from "metabase-types/api/mocks/transform";

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
            suggestedCodeEdits: [],
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
            suggestedCodeEdits: [],
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
            suggestedCodeEdits: [],
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
            suggestedCodeEdits: [],
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
            suggestedCodeEdits: [],
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
});
