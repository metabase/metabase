import { getStylesRef, rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

export const getCalendarOverrides = (): MantineThemeOverride["components"] => ({
  Day: {
    styles: theme => ({
      day: {
        width: rem(40),
        height: rem(40),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        lineHeight: rem(24),
        borderRadius: theme.radius.xs,

        "&:hover": {
          backgroundColor: theme.colors.bg[0],
        },
        "&[data-disabled]": {
          color: theme.colors.bg[2],
        },
        "&[data-weekend]": {
          color: theme.colors.text[2],
        },
        "&[data-outside]": {
          color: theme.colors.bg[2],
        },
        "&[data-in-range]": {
          color: theme.colors.text[1],
          borderRadius: 0,
          backgroundColor: theme.colors.brand[0],
          "&:hover": {
            backgroundColor: theme.colors.brand[0],
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
  Month: {
    styles: () => ({
      monthCell: {
        ref: getStylesRef("monthCell"),

        "&[data-with-spacing]": {
          padding: 0,

          "&:not(:first-of-type)": {
            paddingLeft: rem(1),
          },
          "&:not(:last-of-type)": {
            paddingRight: rem(1),
          },
        },
      },
      monthRow: {
        [`&:not(:first-of-type) .${getStylesRef("monthCell")}`]: {
          paddingTop: rem(1),
        },
        [`&:not(:last-of-type) .${getStylesRef("monthCell")}`]: {
          paddingBottom: rem(1),
        },
      },
    }),
  },
  WeekdaysRow: {
    styles: theme => ({
      weekday: {
        width: rem(40),
        height: rem(40),
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.md,
        lineHeight: rem(24),
        textAlign: "center",
        paddingBottom: 0,
      },
    }),
  },
  PickerControl: {
    styles: theme => ({
      pickerControl: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        lineHeight: rem(24),
        width: rem(80),
        height: rem(32),
        borderRadius: theme.radius.sm,

        "&:hover": {
          backgroundColor: theme.colors.bg[0],
        },
        "&[data-disabled]": {
          color: theme.colors.bg[2],
        },
        "&[data-weekend]": {
          color: theme.colors.text[2],
        },
        "&[data-outside]": {
          color: theme.colors.bg[2],
        },
        "&[data-in-range]": {
          color: theme.colors.text[1],
          borderRadius: 0,
          backgroundColor: theme.colors.brand[0],
          "&:hover": {
            backgroundColor: theme.colors.brand[0],
          },
        },
      },
    }),
  },
  CalendarHeader: {
    styles: theme => ({
      calendarHeader: {
        marginBottom: theme.spacing.xs,
      },
      calendarHeaderLevel: {
        height: rem(32),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: "bold",
        lineHeight: rem(24),

        "&:hover": {
          backgroundColor: theme.colors.bg[0],
        },
      },
      calendarHeaderControl: {
        width: rem(32),
        height: rem(32),
        borderRadius: theme.radius.xs,
        color: theme.colors.bg[2],
        "&:hover": {
          backgroundColor: theme.colors.bg[0],
        },
      },
    }),
  },
});
