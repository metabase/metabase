import type { MantineThemeOverride } from "@mantine/core";
import { SelectItem } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      withinPortal: true,
      itemComponent: SelectItem,
    },
    styles: theme => ({
      itemsWrapper: {
        padding: "0.75rem",
      },
      item: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: 700,
        lineHeight: theme.lineHeight,
        padding: theme.spacing.md,
        "&:hover, &:focus": {
          color: theme.colors.brand[1],
          backgroundColor: theme.colors.bg[0],
        },
      },
      separator: {
        padding: `0.375rem ${theme.spacing.md}`,
      },
      separatorLabel: {
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,

        "&::after": {
          display: "none",
        },
      },
    }),
  },
});
