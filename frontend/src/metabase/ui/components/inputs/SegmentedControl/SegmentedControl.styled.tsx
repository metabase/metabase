import type {
  MantineThemeOverride,
  SegmentedControlStylesParams,
} from "@mantine/core";
import { rem } from "@mantine/core";

export const getSegmentedControlOverrides =
  (): MantineThemeOverride["components"] => ({
    SegmentedControl: {
      defaultProps: {
        size: "md",
        radius: rem(4),
      },
      styles: (theme, { fullWidth }: SegmentedControlStylesParams) => {
        return {
          label: {
            padding: fullWidth ? `${rem(8)} ${rem(16)}` : rem(8),
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
