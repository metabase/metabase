import type { DocumentsState } from "metabase/redux/store/documents";
import type { VisualizationSettings } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import {
  documentsReducer,
  initialState,
  replaceVizSettings,
  updateVizSettings,
} from "./documents.slice";

const DRAFT_CARD_ID = -1;

describe("documents slice", () => {
  describe("updateVizSettings", () => {
    it("merges the payload into the draft card's settings", () => {
      const state = documentsReducer(
        createStateWithDraftCard({ "card.title": "Title", threshold: 42 }),
        updateVizSettings({
          cardId: DRAFT_CARD_ID,
          settings: { threshold: 43 },
        }),
      );

      expect(getDraftCardSettings(state)).toEqual({
        "card.title": "Title",
        threshold: 43,
      });
    });

    it("ignores cards without a draft", () => {
      const initial = createStateWithDraftCard({ threshold: 42 });
      const state = documentsReducer(
        initial,
        updateVizSettings({ cardId: 1, settings: { threshold: 43 } }),
      );

      expect(state).toEqual(initial);
    });
  });

  describe("replaceVizSettings", () => {
    it("drops keys missing from the payload", () => {
      const state = documentsReducer(
        createStateWithDraftCard({ "card.title": "Title", threshold: 42 }),
        replaceVizSettings({
          cardId: DRAFT_CARD_ID,
          settings: { "custom-viz:plugin:threshold": 43 },
        }),
      );

      expect(getDraftCardSettings(state)).toEqual({
        "custom-viz:plugin:threshold": 43,
      });
    });

    it("ignores cards without a draft", () => {
      const initial = createStateWithDraftCard({ threshold: 42 });
      const state = documentsReducer(
        initial,
        replaceVizSettings({ cardId: 1, settings: { threshold: 43 } }),
      );

      expect(state).toEqual(initial);
    });
  });
});

function createStateWithDraftCard(
  visualization_settings: VisualizationSettings,
): DocumentsState {
  return {
    ...initialState,
    draftCards: {
      [DRAFT_CARD_ID]: createMockCard({
        id: DRAFT_CARD_ID,
        visualization_settings,
      }),
    },
  };
}

function getDraftCardSettings(state: DocumentsState) {
  return state.draftCards[DRAFT_CARD_ID].visualization_settings;
}
