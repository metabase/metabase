import type { MantineThemeOverride } from "@mantine/core";
import { rem, getSize } from "@mantine/core";

const SIZES = {
  xs: rem(12),
  sm: rem(14),
  md: rem(16),
  lg: rem(20),
};

const SWITCH_PADDING = {
  xs: rem(8),
  sm: rem(8),
  md: rem(16),
  lg: rem(20),
};

export const getSwitchOverrides = (): MantineThemeOverride["components"] => ({
  Switch: {
    defaultProps: {
      color: "brand",
    },
    styles: (theme, params, { size = "md" }) => {
      return {
        labelWrapper: {
          color: theme.colors.text[2],
        },
        label: {
          fontWeight: 700,
          fontSize: getSize({ size, sizes: SIZES }),
          paddingLeft: getSize({ size, sizes: SWITCH_PADDING }),
        },
      };
    },
  },
});
