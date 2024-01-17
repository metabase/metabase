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
            color: theme.fn.themeColor("text-dark"),
            padding: fullWidth
              ? `${theme.spacing.sm} ${theme.spacing.md}`
              : theme.spacing.sm,
            fontSize: theme.fontSizes.md,
            fontWeight: "normal",
            lineHeight: "1rem",
            "&:hover": {
              color: theme.fn.themeColor("brand"),
            },
            "&[data-disabled]": {
              "&, &:hover": {
                color: theme.fn.themeColor("text-light"),
              },
            },
            "&[data-active]": {
              "&, &:hover": {
                color: theme.fn.themeColor("text-dark"),
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
            backgroundColor: theme.fn.themeColor("bg-medium"),
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
