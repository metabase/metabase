import type { MantineThemeOverride } from "@mantine/core";
import { px, rem, getSize } from "@mantine/core";
import { SelectItem } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      size: "md",
      withinPortal: true,
      dropdownComponent: "div",
      itemComponent: SelectItem,
      maxDropdownHeight: 512,
    },
    styles: (theme, _, { size = "md" }) => ({
      label: {
        color: theme.colors.text[1],
        fontSize: getSize({ size, sizes: theme.fontSizes }),
      },
      rightSection: {
        svg: {
          color: theme.colors.text[2],
          width: "1rem",
          height: "1rem",

          "&[data-chevron] path": {
            d: 'path("M 1.38 4.19 a 0.7 0.7 90 0 1 0.99 0 L 7.5 9.32 l 5.13 -5.13 a 0.7 0.7 90 1 1 0.99 0.99 l -5.63 5.63 a 0.7 0.7 90 0 1 -0.99 0 l -5.63 -5.63 a 0.7 0.7 90 0 1 0 -0.99 z")',
          },
          "&:not([data-chevron]) path": {
            d: 'path("M 4.25 3.25 a 0.7 0.7 90 0 0 -0.99 0.99 L 6.51 7.5 l -3.25 3.25 a 0.7 0.7 90 1 0 0.99 0.99 L 7.5 8.49 l 3.25 3.25 a 0.7 0.7 90 1 0 0.99 -0.99 L 8.49 7.5 l 3.25 -3.25 a 0.7 0.7 90 0 0 -0.99 -0.99 L 7.5 6.51 L 4.25 3.25 z")',
          },
        },
      },
      itemsWrapper: {
        padding: "0.75rem",
      },
      item: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        padding: theme.spacing.sm,
        "&:hover:not([data-disabled]), &:focus": {
          color: theme.colors.brand[1],
          backgroundColor: theme.colors.brand[0],
        },
        "&[data-disabled]": {
          color: theme.colors.text[0],
        },
      },
      separator: {
        padding: `0 ${theme.spacing.sm}`,

        "&:not(:first-of-type)": {
          "&::before": {
            content: '""',
            display: "block",
            marginTop: rem(px(theme.spacing.sm) - 1),
            marginBottom: theme.spacing.xs,
            borderTop: `1px solid ${theme.colors.border[0]}`,
          },
        },
      },
      separatorLabel: {
        color: theme.colors.text[0],
        marginTop: "0 !important",
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,

        "&::after": {
          display: "none",
        },
      },
    }),
    sizes: {
      xs: theme => ({
        item: {
          fontSize: theme.fontSizes.sm,
          lineHeight: theme.lineHeight,
        },
        separatorLabel: {
          fontSize: theme.fontSizes.xs,
        },
      }),
      md: theme => ({
        item: {
          fontSize: theme.fontSizes.md,
          lineHeight: "1.5rem",
        },
        separatorLabel: {
          fontSize: theme.fontSizes.sm,
        },
      }),
    },
  },
});
