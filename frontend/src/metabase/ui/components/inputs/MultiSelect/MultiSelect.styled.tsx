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
        variant: "default",
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
        values: {
          gap: theme.spacing.sm,
          minHeight: getSize({ size, sizes: SIZES }),
          marginLeft: 0,
        },
        value: {
          margin: 0,
        },
        searchInput: {
          "&::placeholder": {
            color: invalid ? theme.colors.error[0] : theme.colors.text[0],
          },
        },
        rightSection: {
          svg: {
            color: `${
              invalid ? theme.colors.error[0] : theme.colors.text[2]
            } !important`,
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
