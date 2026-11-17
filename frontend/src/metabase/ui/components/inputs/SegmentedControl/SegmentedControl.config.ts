import {
  type MantineThemeOverride,
  SegmentedControl,
  rem,
} from "@mantine/core";

import S from "./SegmentedControl.module.css";

export const segmentedControlOverrides: MantineThemeOverride["components"] = {
  SegmentedControl: SegmentedControl.extend({
    defaultProps: {
      size: "sm",
      radius: rem(6),
    },
    classNames: {
      root: S.SegmentedControl,
      label: S.SegmentedControlLabel,
      innerLabel: S.SegmentedControlInnerLabel,
      control: S.SegmentedControl_Control,
      input: S.SegmentedControlInput,
      indicator: S.SegmentedControlIndicator,
    },
  }),
};
