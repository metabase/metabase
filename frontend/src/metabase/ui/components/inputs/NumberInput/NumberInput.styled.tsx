import { getSize, rem } from "@mantine/core";
import type {
  ContextStylesParams,
  MantineThemeOverride,
  NumberInputStylesParams,
} from "@mantine/core";

const CONTROL_SIZES = {
  xs: rem(16),
  md: rem(20),
};

export const getNumberInputOverrides =
  (): MantineThemeOverride["components"] => ({
    NumberInput: {
      defaultProps: {
        size: "md",
        hideControls: true,
      },
      styles: (
        theme,
        params: NumberInputStylesParams,
        { size = "md" }: ContextStylesParams,
      ) => ({
        wrapper: {
          marginTop: theme.spacing.xs,
        },
        input: {
          "&:read-only:not(:disabled)": {
            borderColor: theme.colors.text[0],
          },
        },
        control: {
          color: theme.colors.text[2],
          width: getSize({ size, sizes: CONTROL_SIZES }),
          borderColor: theme.colors.border[0],
          "&:disabled": {
            color: theme.colors.border[0],
            backgroundColor: theme.colors.bg[0],
          },
        },
        rightSection: {
          width: "auto",
          margin: 0,
          borderTopRightRadius: theme.radius.xs,
          borderBottomRightRadius: theme.radius.xs,
        },
      }),
    },
  });
