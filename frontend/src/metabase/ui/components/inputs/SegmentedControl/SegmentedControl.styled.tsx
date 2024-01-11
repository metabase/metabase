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
      styles: (
        theme,
        { fullWidth, shouldAnimate }: SegmentedControlStylesParams,
      ) => {
        return {
          label: {
            color: theme.fn.themeColor("text-medium"),
            padding: fullWidth ? `${rem(8)} ${rem(16)}` : rem(8),
            fontWeight: "normal",
            lineHeight: "1rem",
            "&[data-active]": {
              "&, &:hover": {
                color: theme.fn.themeColor("text-dark"),
              },
            },
            "&[data-disabled]": {
              "&, &:hover": {
                color: theme.fn.themeColor("text-light"),
              },
            },
          },
          control: {
            "&:not(:first-of-type)": {
              borderColor: theme.fn.themeColor("border"),
            },
          },
          input: {
            "&:disabled + label": {
              "&, &:hover": {
                color: theme.fn.themeColor("text-light"),
              },
            },
          },
          root: {
            backgroundColor: theme.fn.themeColor("bg-light"),
          },
          controlActive: {
            backgroundColor: shouldAnimate ? theme.white : undefined,
          },
          indicator: {
            backgroundColor: theme.white,
          },
        };
      },
    },
  });
