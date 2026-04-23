import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import type { CardId } from "metabase-types/api";

import { initialState } from "./documents.slice";

export const getDocumentsState = (state: State) =>
  state.documents || initialState;

export const getSelectedQuestionId = createSelector(
  getDocumentsState,
  (documents): CardId | null => {
    const { selectedEmbedIndex, cardEmbeds } = documents;
    if (selectedEmbedIndex === null || !cardEmbeds[selectedEmbedIndex]) {
      return null;
    }
    return cardEmbeds[selectedEmbedIndex].id;
  },
);

export const getSidebarOpen = createSelector(
  getDocumentsState,
  (state) => state.selectedEmbedIndex !== null,
);

export const getCommentSidebarOpen = createSelector(
  getDocumentsState,
  (state) => state.isCommentSidebarOpen,
);

export const getCardEmbeds = createSelector(
  getDocumentsState,
  (documents) => documents?.cardEmbeds ?? [],
);

export const getSelectedEmbedIndex = createSelector(
  getDocumentsState,
  (documents): number | null => documents.selectedEmbedIndex,
);

export const getCurrentDocument = createSelector(
  getDocumentsState,
  (documents) => documents?.currentDocument || null,
);

export const getMentionsCache = createSelector(
  getDocumentsState,
  (documents) => documents.mentionsCache,
);

export const getChildTargetId = createSelector(
  getDocumentsState,
  (documents) => documents.childTargetId,
);

export const getHoveredChildTargetId = createSelector(
  getDocumentsState,
  (documents) => documents.hoveredChildTargetId,
);

export const getHasUnsavedChanges = createSelector(
  getDocumentsState,
  (documents) => documents.hasUnsavedChanges,
);

export const getIsHistorySidebarOpen = createSelector(
  getDocumentsState,
  (documents) => documents.isHistorySidebarOpen,
);
