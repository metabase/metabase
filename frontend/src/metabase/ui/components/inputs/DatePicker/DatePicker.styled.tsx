import type { MantineThemeOverride } from "@mantine/core";
import type { DayStylesParams } from "@mantine/dates";

export const getDatePickerOverrides =
  (): MantineThemeOverride["components"] => ({
    DatePicker: {
      defaultProps: {
        size: "md",
        maxLevel: "month",
      },
      styles: (theme, { isStatic }: DayStylesParams) => ({
        day: {
          width: "1.5rem",
          height: "1.5rem",
          fontSize: theme.fontSizes.sm,
          lineHeight: theme.lineHeight,
          borderRadius: theme.radius.xs,

          "&:hover": {
            backgroundColor: theme.colors.bg[0],
          },
          "&[data-disabled]": {
            color: theme.colors.text[0],
          },
          "&[data-weekend]": {
            color: theme.colors.error[0],
          },
          "&[data-outside]": {
            color: theme.colors.text[0],
          },
          "&[data-in-range]": {
            borderRadius: 0,
            backgroundColor: theme.colors.focus[0],
            "&:hover": {
              backgroundColor: theme.colors.focus[0],
            },
          },
          "&[data-first-in-range]": {
            borderTopLeftRadius: theme.radius.xs,
            borderBottomLeftRadius: theme.radius.xs,
          },
          "&[data-last-in-range]": {
            borderTopRightRadius: theme.radius.xs,
            borderBottomRightRadius: theme.radius.xs,
          },
          "&[data-selected]": {
            color: theme.white,
            backgroundColor: theme.colors.brand[1],
            "&:hover": {
              backgroundColor: theme.colors.brand[1],
            },
          },
        },
      }),
    },
  });
