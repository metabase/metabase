import type {
  MantineSize,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getSize, px, rem } from "@mantine/core";
import { SelectDropdown } from "./SelectDropdown";
import { SelectItem } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      size: "md",
      withinPortal: true,
      dropdownComponent: SelectDropdown,
      itemComponent: SelectItem,
      maxDropdownHeight: 512,
    },
    styles: (theme, _, { size = "md" }) => ({
      ...getSelectInputOverrides(theme),
      ...getSelectItemsOverrides(theme, size),
      wrapper: {
        "&:not(:only-child)": {
          marginTop: theme.spacing.xs,
        },
      },
    }),
  },
});

export const getSelectInputOverrides = (theme: MantineTheme) => {
  return {
    rightSection: {
      svg: {
        color: theme.colors.text[2],
        width: "1rem",
        height: "1rem",

        "&[data-chevron] path": {
          d: 'path("M 1.3781 4.1906 a 0.7031 0.7031 90 0 1 0.9938 0 L 7.5 9.3187 l 5.1281 -5.1281 a 0.7031 0.7031 90 1 1 0.9938 0.9938 l -5.625 5.625 a 0.7031 0.7031 90 0 1 -0.9938 0 l -5.625 -5.625 a 0.7031 0.7031 90 0 1 0 -0.9938 z")',
        },
        "&:not([data-chevron]) path": {
          d: 'path("4.2469 3.2531 a 0.7031 0.7031 90 0 0 -0.9938 0.9938 L 6.5063 7.5 l -3.2531 3.2531 a 0.7031 0.7031 90 1 0 0.9938 0.9938 L 7.5 8.4938 l 3.2531 3.2531 a 0.7031 0.7031 90 1 0 0.9938 -0.9938 L 8.4938 7.5 l 3.2531 -3.2531 a 0.7031 0.7031 90 0 0 -0.9938 -0.9938 L 7.5 6.5063 L 4.2469 3.2531 z")',
        },
      },
    },
  };
};

const ITEM_FONT_SIZES = {
  xs: rem(12),
  md: rem(14),
};

const SEPARATOR_FONT_SIZES = {
  xs: rem(12),
  md: rem(12),
};

const LINE_HEIGHTS = {
  xs: rem(16),
  md: rem(24),
};

export const getSelectItemsOverrides = (
  theme: MantineTheme,
  size: MantineSize | number,
) => {
  return {
    itemsWrapper: {
      padding: "0.75rem",
    },
    item: {
      color: theme.colors.text[2],
      fontSize: getSize({ size, sizes: ITEM_FONT_SIZES }),
      lineHeight: getSize({ size, sizes: LINE_HEIGHTS }),
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
      fontSize: getSize({ size, sizes: SEPARATOR_FONT_SIZES }),
      marginTop: "0 !important",
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,

      "&::after": {
        display: "none",
      },
    },
  };
};
