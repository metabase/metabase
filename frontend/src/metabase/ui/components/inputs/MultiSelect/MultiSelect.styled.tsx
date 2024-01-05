import { getSize, rem } from "@mantine/core";
import type {
  MantineThemeOverride,
  MultiSelectStylesParams,
} from "@mantine/core";
import { SelectDropdown } from "../Select/SelectDropdown";
import { SelectItem } from "../Select/SelectItem";
import {
  getSelectInputOverrides,
  getSelectItemsOverrides,
} from "../Select/Select.styled";

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
          color: "text.2",
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
            color: invalid ? theme.colors.error[0] : theme.colors.text[0],
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
          color: theme.colors.text[2],
          backgroundColor: theme.colors.bg[1],
        },
        defaultValueRemove: {
          color: theme.colors.text[2],
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
