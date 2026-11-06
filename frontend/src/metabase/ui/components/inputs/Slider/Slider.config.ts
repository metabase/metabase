import { RangeSlider, Slider } from "@mantine/core";

import S from "./Slider.module.css";

const sliderDefaultProps = {
  classNames: {
    mark: S.Mark,
  },
  __vars: {
    "--track-bg": "var(--mb-color-border-neutral)",
    "--slider-track-bg": "var(--mb-color-border-neutral)",
  },
};

export const sliderOverrides = {
  Slider: Slider.extend({
    defaultProps: sliderDefaultProps,
  }),
  // Prototype: RangeSlider for the number filter histogram.
  RangeSlider: RangeSlider.extend({
    defaultProps: sliderDefaultProps,
  }),
};
