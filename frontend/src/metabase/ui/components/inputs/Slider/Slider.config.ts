import { Slider } from "@mantine/core";

import S from "./Slider.module.css";

export const sliderOverrides = {
  Slider: Slider.extend({
    defaultProps: {
      classNames: {
        mark: S.Mark,
      },
      __vars: {
        "--track-bg": "var(--mb-color-border)",
        "--slider-track-bg": "var(--mb-color-border)",
      },
    },
  }),
};
