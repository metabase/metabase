import type { State } from "metabase/redux/store";

// The slides editor slice is registered into `commonReducers` as `slidesEditor`,
// but the `State` type is derived from the static reducer map and doesn't know
// about it. A small cast keeps the rest of the code typed.
const getSlice = (state: State) =>
  (state as unknown as {
    slidesEditor: ReturnType<
      typeof import("./slides.slice").slidesReducer
    >;
  }).slidesEditor;

export const getSlides = (state: State) => getSlice(state).slides;
export const getActiveSlideIndex = (state: State) =>
  getSlice(state).activeIndex;
export const getActiveSlide = (state: State) => {
  const { slides, activeIndex } = getSlice(state);
  return slides[activeIndex];
};
export const getDeckId = (state: State) => getSlice(state).deckId;
export const getDeckName = (state: State) => getSlice(state).name;
export const getIsDirty = (state: State) => getSlice(state).isDirty;
export const getIsGenerateModalOpen = (state: State) =>
  getSlice(state).isGenerateModalOpen;
