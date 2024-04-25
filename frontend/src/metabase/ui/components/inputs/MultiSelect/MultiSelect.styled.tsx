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
  xs: rem(16),
  md: rem(24),
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
          minHeight: getSize({ size, sizes: SIZES }),
          marginLeft: 0,
          gap: theme.spacing.sm,
        },
        value: {
          margin: 0,
        },
        searchInput: {
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
          height: getSize({ size, sizes: SIZES }),
          paddingLeft: theme.spacing.sm,
          paddingRight: theme.spacing.sm,
          fontWeight: "normal",
          fontSize: theme.fontSizes.xs,
          borderRadius: theme.radius.xs,
          color: theme.fn.themeColor("text-dark"),
          backgroundColor: theme.fn.themeColor("bg-medium"),
        },
        defaultValueRemove: {
          color: theme.fn.themeColor("text-dark"),
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
