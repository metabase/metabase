import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Slide } from "./types";

interface SlidesState {
  deckId: number | null;
  name: string;
  slides: Slide[];
  activeIndex: number;
  isDirty: boolean;
  isGenerateModalOpen: boolean;
}

const initialState: SlidesState = {
  deckId: null,
  name: "",
  slides: [],
  activeIndex: 0,
  isDirty: false,
  isGenerateModalOpen: false,
};

const slidesSlice = createSlice({
  name: "slidesEditor",
  initialState,
  reducers: {
    loadDeck(
      state,
      action: PayloadAction<{ id: number; name: string; slides: Slide[] }>,
    ) {
      state.deckId = action.payload.id;
      state.name = action.payload.name;
      state.slides = action.payload.slides;
      state.activeIndex = 0;
      state.isDirty = false;
    },
    resetDeck() {
      return initialState;
    },
    setName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      state.isDirty = true;
    },
    setActiveIndex(state, action: PayloadAction<number>) {
      state.activeIndex = Math.max(
        0,
        Math.min(action.payload, state.slides.length - 1),
      );
    },
    setSlideContent(
      state,
      action: PayloadAction<{ index: number; doc: Slide["doc"] }>,
    ) {
      const { index, doc } = action.payload;
      const slide = state.slides[index];
      if (slide) {
        slide.doc = doc;
        state.isDirty = true;
      }
    },
    addSlide(state) {
      const id = `slide-${Date.now()}`;
      state.slides.push({
        id,
        layout: "default",
        doc: { type: "doc", content: [{ type: "paragraph" }] },
      });
      state.activeIndex = state.slides.length - 1;
      state.isDirty = true;
    },
    removeSlide(state, action: PayloadAction<number>) {
      if (state.slides.length <= 1) {
        return;
      }
      state.slides.splice(action.payload, 1);
      if (state.activeIndex >= state.slides.length) {
        state.activeIndex = state.slides.length - 1;
      }
      state.isDirty = true;
    },
    moveSlide(
      state,
      action: PayloadAction<{ from: number; to: number }>,
    ) {
      const { from, to } = action.payload;
      if (from === to) {
        return;
      }
      const [moved] = state.slides.splice(from, 1);
      state.slides.splice(to, 0, moved);
      if (state.activeIndex === from) {
        state.activeIndex = to;
      } else if (from < state.activeIndex && to >= state.activeIndex) {
        state.activeIndex -= 1;
      } else if (from > state.activeIndex && to <= state.activeIndex) {
        state.activeIndex += 1;
      }
      state.isDirty = true;
    },
    replaceSlides(
      state,
      action: PayloadAction<{ name?: string; slides: Slide[] }>,
    ) {
      state.slides = action.payload.slides;
      state.activeIndex = 0;
      state.isDirty = true;
      if (action.payload.name) {
        state.name = action.payload.name;
      }
    },
    markClean(state) {
      state.isDirty = false;
    },
    openGenerateModal(state) {
      state.isGenerateModalOpen = true;
    },
    closeGenerateModal(state) {
      state.isGenerateModalOpen = false;
    },
  },
});

export const {
  loadDeck,
  resetDeck,
  setName,
  setActiveIndex,
  setSlideContent,
  addSlide,
  removeSlide,
  moveSlide,
  replaceSlides,
  markClean,
  openGenerateModal,
  closeGenerateModal,
} = slidesSlice.actions;

export const slidesReducer = slidesSlice.reducer;
