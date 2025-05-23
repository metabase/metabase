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
      radius: rem(4),
    },
    classNames: {
      root: S.SegmentedControl,
      label: S.SegmentedControlLabel,
      control: S.SegmentedControl_Control,
      input: S.SegmentedControlInput,
    },
    vars: (theme, props) => ({
      root: {
        "--sc-active-text-color": props.c ?? "var(--mb-color-text-dark)",
        "--sc-background-color": props.bg ?? "var(--mb-color-bg-medium)",
        "--sc-padding": props.fullWidth
          ? `${theme.spacing.sm} ${theme.spacing.md}`
          : theme.spacing.sm,
        "--sc-font-size": theme.fontSizes.md,
      },
    }),
  }),
};
