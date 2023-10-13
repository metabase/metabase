import { rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";
import type { DayStylesParams } from "@mantine/dates";

export const getDatePickerOverrides =
  (): MantineThemeOverride["components"] => ({
    DatePicker: {
      defaultProps: {
        size: "sm",
        maxLevel: "month",
        hideOutsideDates: true,
      },
      styles: (theme, { isStatic }: DayStylesParams) => ({
        day: {
          width: rem(24),
          height: rem(24),
          color: theme.colors.text[2],
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
            color: theme.white,
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
        weekday: {
          width: rem(24),
          height: rem(28),
          color: theme.colors.text[0],
          fontSize: theme.fontSizes.xs,
          lineHeight: theme.lineHeight,
          textAlign: "center",
          paddingBottom: theme.spacing.xs,
        },
        calendarHeader: {
          marginBottom: rem(8),
        },
        calendarHeaderLevel: {
          height: rem(32),
          color: theme.colors.text[2],
          fontSize: theme.fontSizes.sm,
          fontWeight: "bold",
          lineHeight: theme.lineHeight,
        },
        calendarHeaderControl: {
          width: rem(32),
          height: rem(32),
          borderRadius: theme.radius.sm,
          color: theme.colors.text[2],
          "&:hover": {
            backgroundColor: theme.colors.bg[0],
          },
        },
      }),
    },
  });
