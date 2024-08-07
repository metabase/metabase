import type {
  MantineThemeOverride,
  MultiSelectStylesParams,
} from "@mantine/core";
import { getSize, rem } from "@mantine/core";

import {
  getSelectInputOverrides,
  getSelectItemsOverrides,
} from "../Select/Select.styled";
import { SelectDropdown } from "../Select/SelectDropdown";
import { SelectItem } from "../Select/SelectItem";

const SIZES = {
  xs: rem(30),
  md: rem(38),
};

const VALUE_SIZES = {
  xs: rem(20),
  md: rem(28),
};

const RIGHT_SECTION_SIZES = {
  default: rem(40),
  unstyled: rem(28),
};

export const getMultiSelectOverrides =
  (): MantineThemeOverride["components"] => ({
    MultiSelect: {
      defaultProps: {
        size: "md",
        variant: "default",
        withinPortal: true,
        dropdownComponent: SelectDropdown,
        itemComponent: SelectItem,
        clearButtonProps: {
          color: "text-dark",
        },
        "data-testid": "multi-select",
      },
      styles: (
        theme,
        { invalid }: MultiSelectStylesParams,
        { size = "md", variant = "default" },
      ) => ({
        ...getSelectInputOverrides(theme),
        ...getSelectItemsOverrides(theme, size),
        values: {
          boxSizing: "border-box",
          minHeight: getSize({ size, sizes: SIZES }),
          marginLeft: 0,
          gap: theme.spacing.xs,
          paddingTop: theme.spacing.xs,
          paddingLeft: theme.spacing.xs,
          paddingBottom: theme.spacing.xs,
          paddingRight:
            variant === "unstyled"
              ? RIGHT_SECTION_SIZES.unstyled
              : RIGHT_SECTION_SIZES.default,
          alignItems: "center",
          "[data-with-icon=true] &": {
            paddingLeft: 0,
          },
        },
        input: {
          padding: 0,
          boxSizing: "border-box",
          "&[data-with-icon]": {
            paddingLeft: theme.spacing.lg,
          },
          background: "var(--mb-color-background)",
          color: "var(--mb-color-text-primary)",
          "&::placeholder": {
            color: "var(--mb-color-text-secondary)",
          },
        },
        icon: {
          width: theme.spacing.lg,
        },
        value: {
          margin: 0,
        },
        searchInput: {
          minHeight: getSize({ size, sizes: VALUE_SIZES }),
          padding: 0,
          marginLeft: theme.spacing.sm,
          "&::placeholder": {
            color: invalid
              ? theme.fn.themeColor("error")
              : theme.fn.themeColor("text-light"),
          },
          "&::-webkit-search-cancel-button": {
            display: "none",
          },
          "[data-with-icon=true] &:first-child": {
            marginLeft: 0,
          },
        },
        defaultValue: {
          padding: 0,
          paddingInline: theme.spacing.sm,
          height: getSize({ size, sizes: VALUE_SIZES }),
          fontWeight: "bold",
          fontSize: getSize({ size, sizes: theme.fontSizes }),
          borderRadius: theme.radius.xs,
          color: "var(--mb-color-text-selected)",
          backgroundColor: "var(--mb-color-background-selected)",
        },
        defaultValueRemove: {
          color: theme.fn.themeColor("brand"),
          width: rem(12),
          height: rem(12),
          minWidth: rem(12),
          minHeight: rem(12),
          borderWidth: 0,
          marginLeft: theme.spacing.xs,

          svg: {
            width: "100% !important",
            height: "100% !important",
          },
        },
        dropdown: {
          backgroundColor: "var(--mb-color-background)",
          borderColor: "var(--mb-color-border)",
        },
      }),
      variants: {
        default: () => ({
          input: {
            paddingTop: rem(7),
            paddingBottom: rem(7),
          },
        }),
        unstyled: () => ({
          input: {
            paddingTop: rem(8),
            paddingBottom: rem(8),
          },
        }),
      },
    },
  });
