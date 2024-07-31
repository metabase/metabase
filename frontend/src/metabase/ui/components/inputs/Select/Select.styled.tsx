import {
  type CSSObject,
  type MantineSize,
  type MantineTheme,
  type MantineThemeOverride,
  getSize,
  getStylesRef,
  rem,
  px,
} from "@mantine/core";

import { SelectDropdown } from "./SelectDropdown";
import { SelectItem, getItemFontSize, getItemLineHeight } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: () => ({
      size: "md",
      withinPortal: true,
      dropdownComponent: SelectDropdown,
      itemComponent: SelectItem,
      maxDropdownHeight: 512,
      clearButtonProps: {
        color: "text-dark",
      },
    }),
    styles: (theme, _, { size = "md" }) => ({
      ...getSelectInputOverrides(theme),
      ...getSelectItemsOverrides(theme, size),
      // For epic (metabase#38699)
      dropdown: {
        background: "var(--mb-color-background)",
        borderColor: "var(--mb-color-border)",
        ">div": {
          maxHeight: "none !important",
        },
        padding: 0,
        overflow: "auto",
      },
    }),
  },
});

export const getSelectInputOverrides = (
  theme: MantineTheme,
): Record<string, CSSObject> => {
  return {
    root: {
      [["label", "description", "error"]
        .map(name => `&:has(.${getStylesRef(name)})`)
        .join(",")]: {
        [`.${getStylesRef("wrapper")}`]: {
          marginTop: theme.spacing.xs,
        },
      },
    },
    label: {
      ref: getStylesRef("label"),
    },
    description: {
      ref: getStylesRef("description"),
    },
    error: {
      ref: getStylesRef("error"),
    },
    wrapper: {
      ref: getStylesRef("wrapper"),
      color: theme.fn.themeColor("text-dark"),
      [`&:has(.${getStylesRef("input")}[data-disabled])`]: {
        opacity: 1,
        pointerEvents: "auto",
        [`.${getStylesRef("input")}`]: {
          color: theme.fn.themeColor("text-dark"),
          backgroundColor: theme.fn.themeColor("bg-light"),
          "&::placeholder": {
            color: theme.fn.themeColor("text-light"),
          },
        },
        [`.${getStylesRef("rightSection")}`]: {
          color: theme.fn.themeColor("text-light"),
        },
      },
      [`&:has(.${getStylesRef("input")}[data-invalid])`]: {
        [`.${getStylesRef("rightSection")}`]: {
          color: theme.fn.themeColor("error"),
        },
      },
    },
    input: {
      ref: getStylesRef("input"),
      color: "var(--mb-color-text-primary)",
      backgroundColor: "var(--mb-color-background)",

      "&[data-disabled]": {
        opacity: 1,
      },
    },
    rightSection: {
      ref: getStylesRef("rightSection"),
      color: "var(--mb-color-text-primary)",

      svg: {
        color: "inherit !important",
        width: "1rem !important",
        height: "1rem !important",

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

const SEPARATOR_FONT_SIZES = {
  xs: rem(12),
  md: rem(12),
};

export const getSelectItemsOverrides = (
  theme: MantineTheme,
  size: MantineSize | number,
): Record<string, CSSObject> => {
  return {
    itemsWrapper: {
      padding: "0.75rem",
    },
    item: {
      color: "var(--mb-color-text-primary)",
      fontSize: getItemFontSize(size),
      lineHeight: getItemLineHeight(size),
      padding: theme.spacing.sm,
      "&[data-hovered]": {
        color: "var(--mb-color-text-selected)",
        backgroundColor: "var(--mb-color-background-selected)",
      },
      "&[data-selected]": {
        color: theme.fn.themeColor("text-white"),
        backgroundColor: "var(--mb-color-background-brand)",
      },
      "&[data-disabled]": {
        color: theme.fn.themeColor("text-light"),
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
          borderTop: `1px solid ${theme.fn.themeColor("border")}`,
        },
      },
    },
    separatorLabel: {
      color: theme.fn.themeColor("text-light"),
      fontSize: getSize({ size, sizes: SEPARATOR_FONT_SIZES }),
      marginTop: "0 !important",
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,

      "&::after": {
        display: "none",
      },
    },
    nothingFound: {
      color: theme.fn.themeColor("text-light"),
      fontSize: getItemFontSize(size),
      lineHeight: getItemLineHeight(size),
      padding: theme.spacing.sm,
    },
  };
};
