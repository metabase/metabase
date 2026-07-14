import {
  type MantineThemeOverride,
  SegmentedControl,
  rem,
} from "@mantine/core";

import S from "./SegmentedControl.module.css";

export const segmentedControlOverrides: MantineThemeOverride["components"] = {
  SegmentedControl: SegmentedControl.extend({
    defaultProps: {
      size: "md",
      radius: rem(10),
      withItemsBorders: false,
    },
    classNames: {
      root: S.SegmentedControl,
      label: S.SegmentedControlLabel,
      control: S.SegmentedControl_Control,
      input: S.SegmentedControlInput,
      indicator: S.SegmentedControlIndicator,
    },
    vars: (_theme, props) => ({
      root: {
        "--sc-active-text-color": props.c ?? "var(--mb-color-text-primary)",
        "--sc-background-color":
          props.bg ?? "var(--mb-color-background_page-tertiary)",
        ...(!props.color && {
          "--sc-color": "var(--mb-color-background_page-primary)",
        }),
        // Figma: label padding 4px 12px, medium 14/16
        "--sc-padding": `${rem(4)} ${rem(12)}`,
        "--sc-font-size": rem(14),
        // Figma Elevation/Light/xs_outline
        "--sc-shadow":
          "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 1px 3px 0 rgba(0, 0, 0, 0.07)",
      },
    }),
  }),
};
