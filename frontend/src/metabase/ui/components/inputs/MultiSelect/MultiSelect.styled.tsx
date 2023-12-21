import { getStylesRef, px, rem } from "@mantine/core";
import type {
  MantineThemeOverride,
  MultiSelectStylesParams,
} from "@mantine/core";
import { SelectDropdown } from "../Select/SelectDropdown";
import { SelectItem } from "../Select/SelectItem";

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
      styles: (theme, { invalid }: MultiSelectStylesParams) => ({
        // input
        wrapper: {
          position: "relative",
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
        rightSection: {
          svg: {
            color: invalid ? theme.colors.error[0] : theme.colors.text[2],
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
        // dropdown
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
        // values
        values: {
          gap: theme.spacing.sm,
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
        defaultValue: {
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
      sizes: {
        xs: theme => ({
          values: {
            minHeight: rem(16),
          },
          defaultValue: {
            minHeight: rem(16),
          },
          item: {
            fontSize: theme.fontSizes.sm,
            lineHeight: theme.lineHeight,
          },
          separatorLabel: {
            fontSize: theme.fontSizes.xs,
          },
        }),
        md: theme => ({
          values: {
            minHeight: rem(24),
          },
          defaultValue: {
            minHeight: rem(24),
          },
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
