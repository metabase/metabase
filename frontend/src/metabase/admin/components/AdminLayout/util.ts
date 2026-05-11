import type { Location, LocationDescriptorObject } from "history";

const NO_SCROLL_TO_TOP_KEY = "noScrollToTop";

export const preventScrollToTop = (
  to: LocationDescriptorObject,
): LocationDescriptorObject => ({
  ...to,
  state: { ...to.state, [NO_SCROLL_TO_TOP_KEY]: true },
});

export const isScrollToTopPrevented = (location: Location): boolean => {
  return !!location?.state?.[NO_SCROLL_TO_TOP_KEY];
};
