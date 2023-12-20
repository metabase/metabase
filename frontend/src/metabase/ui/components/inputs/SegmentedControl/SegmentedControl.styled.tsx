import type {
  MantineThemeOverride,
  SegmentedControlStylesParams,
} from "@mantine/core";
import { getSize, rem } from "@mantine/core";

const OPTION_PADDING = {
  xs: rem(8),
  sm: rem(8),
  md: rem(8),
};

const OPTION_PADDING_FULL_WIDTH_V = {
  xs: rem(8),
  sm: rem(8),
  md: rem(8),
};

const OPTION_PADDING_FULL_WIDTH_H = {
  xs: rem(16),
  sm: rem(16),
  md: rem(16),
};

export const getSegmentedControlOverrides =
  (): MantineThemeOverride["components"] => ({
    SegmentedControl: {
      defaultProps: {
        size: "md",
        radius: rem(4),
      },
      styles: (
        theme,
        { fullWidth }: SegmentedControlStylesParams,
        { size = "md" },
      ) => {
        return {
          label: {
            padding: fullWidth
              ? `${getSize({
                  size,
                  sizes: OPTION_PADDING_FULL_WIDTH_V,
                })} ${getSize({ size, sizes: OPTION_PADDING_FULL_WIDTH_H })}`
              : getSize({ size, sizes: OPTION_PADDING }),
            fontWeight: "normal",
            lineHeight: "1rem",
            "&[data-active]": {
              color: theme.colors.text[2],
            },
          },
        };
      },
    },
  });
