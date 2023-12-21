import { getSize, getStylesRef, rem } from "@mantine/core";
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
      },
      styles: (
        theme,
        { invalid }: MultiSelectStylesParams,
        { size = "md" },
      ) => ({
        ...getSelectInputOverrides(theme),
        ...getSelectItemsOverrides(theme, size),
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
          "&:has(input:disabled)": {
            opacity: 1,
            pointerEvents: "auto",
            [`& .${getStylesRef("input")}`]: {
              color: theme.colors.text[2],
              backgroundColor: theme.colors.bg[0],
              "&::placeholder": {
                color: theme.colors.text[0],
              },
            },
          },
        },
        input: {
          ref: getStylesRef("input"),
        },
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
        },
        defaultValue: {
          minHeight: getSize({ size, sizes: SIZES }),
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
