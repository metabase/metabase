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
      },
      styles: (
        theme,
        { invalid }: MultiSelectStylesParams,
        { size = "md" },
      ) => ({
        ...getSelectInputOverrides(theme),
        ...getSelectItemsOverrides(theme, size),
        values: {
          boxSizing: "border-box",
          minHeight: getSize({ size, sizes: SIZES }),
          marginLeft: 0,
          gap: theme.spacing.xs,
          padding: theme.spacing.xs,
          alignItems: "center",
        },
        input: {
          padding: 0,
          boxSizing: "border-box",
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
        },
        defaultValue: {
          padding: 0,
          paddingInline: theme.spacing.sm,
          height: getSize({ size, sizes: VALUE_SIZES }),
          fontWeight: "bold",
          fontSize: getSize({ size, sizes: theme.fontSizes }),
          borderRadius: theme.radius.xs,
          color: theme.fn.themeColor("brand"),
          backgroundColor: theme.fn.themeColor("bg-medium"),
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
