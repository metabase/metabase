import { rem, getSize } from "@mantine/core";
import type {
  MantineThemeOverride,
  MultiSelectStylesParams,
} from "@mantine/core";

const SIZES = {
  md: rem(24),
};

export const getMultiSelectOverrides =
  (): MantineThemeOverride["components"] => ({
    MultiSelect: {
      defaultProps: {
        size: "md",
        withinPortal: true,
        dropdownComponent: "div",
      },
      styles: (
        theme,
        { invalid }: MultiSelectStylesParams,
        { size = "md" },
      ) => ({
        wrapper: {
          position: "relative",
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
          "&:has(input:disabled)": {
            pointerEvents: "auto",
          },
        },
        searchInput: {
          "&::placeholder": {
            color: invalid ? theme.colors.error[0] : theme.colors.text[0],
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
            path: {
              d: 'path("M 2.855 1.435 C 2.4629 1.0429 1.8271 1.0429 1.435 1.435 C 1.0429 1.8271 1.0429 2.4629 1.435 2.855 L 6.08 7.5 L 1.435 12.145 C 1.0429 12.5371 1.0429 13.1729 1.435 13.565 C 1.8271 13.9571 2.4629 13.9571 2.855 13.565 L 7.5 8.92 L 12.145 13.565 C 12.5371 13.9571 13.1729 13.9571 13.565 13.565 C 13.9571 13.1729 13.9571 12.5371 13.565 12.145 L 8.92 7.5 L 13.565 2.855 C 13.9571 2.4629 13.9571 1.8271 13.565 1.435 C 13.1729 1.0429 12.5371 1.0429 12.145 1.435 L 7.5 6.08 L 2.855 1.435 Z")',
            },
          },
        },
      }),
    },
  });
