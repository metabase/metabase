import type { SliderFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./Slider.module.css";

export const sliderOverrides = {
  Slider: themeComponent<SliderFactory>({
    defaultProps: {
      classNames: {
        mark: S.Mark,
      },
      __vars: {
        "--track-bg": "var(--mb-color-border-neutral)",
        "--slider-track-bg": "var(--mb-color-border-neutral)",
      },
    },
  }),
};
