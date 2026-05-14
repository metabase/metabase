import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { Slide, SlideDataByLayout, SlideLayout } from "./types";

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

const defaultDataFor = <L extends SlideLayout>(
  layout: L,
): SlideDataByLayout[L] => {
  switch (layout) {
    case "cover":
      return {
        title: "Untitled deck",
        subtitle: "",
        accent: "violet",
      } as SlideDataByLayout[L];
    case "bullets":
      return {
        title: "Untitled slide",
        bullets: ["First point", "Second point"],
      } as SlideDataByLayout[L];
    case "closing":
      return {
        title: "Thank you",
      } as SlideDataByLayout[L];
    case "big_quote":
      return {
        quote: "Type your quote here.",
      } as SlideDataByLayout[L];
    case "chart_hero":
      return {
        title: "Untitled chart",
        // Card id 0 = unset (the renderer will show a "pick a card" placeholder)
        card_id: 0,
      } as SlideDataByLayout[L];
    case "metrics_grid":
      return {
        title: "Key metrics",
        metrics: [
          { value: "—", label: "Metric one" },
          { value: "—", label: "Metric two" },
        ],
      } as SlideDataByLayout[L];
    case "title_metrics_with_chart":
      return {
        title: "Untitled",
        card_id: 0,
        metrics: [
          { value: "—", label: "Metric one" },
          { value: "—", label: "Metric two" },
        ],
      } as SlideDataByLayout[L];
    case "two_column":
      return {
        title: "Untitled",
        bullets: ["First point", "Second point"],
        card_id: 0,
      } as SlideDataByLayout[L];
    default: {
      const _exhaustive: never = layout;
      throw new Error(`No default for layout ${String(_exhaustive)}`);
    }
  }
};

export const createBlankSlide = <L extends SlideLayout>(layout: L): Slide => {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    layout,
    data: defaultDataFor(layout),
  } as Slide;
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
    setSlideData(
      state,
      action: PayloadAction<{ index: number; data: Slide["data"] }>,
    ) {
      const { index, data } = action.payload;
      const slide = state.slides[index];
      if (slide) {
        slide.data = data;
        state.isDirty = true;
      }
    },
    addSlide(state, action: PayloadAction<SlideLayout | undefined>) {
      const layout = action.payload ?? "bullets";
      state.slides.push(createBlankSlide(layout));
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
    moveSlide(state, action: PayloadAction<{ from: number; to: number }>) {
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
  setSlideData,
  addSlide,
  removeSlide,
  moveSlide,
  replaceSlides,
  markClean,
  openGenerateModal,
  closeGenerateModal,
} = slidesSlice.actions;

export const slidesReducer = slidesSlice.reducer;
