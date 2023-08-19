import type { MantineThemeOverride } from "@mantine/core";

export const getRadioOverrides = (): MantineThemeOverride["components"] => ({
  Radio: {
    styles: theme => {
      return {
        root: {
          marginBottom: theme.spacing.md,
        },
        label: {
          color: theme.colors.text[2],
          fontWeight: 700,
        },
      };
    },
  },
  RadioGroup: {
    styles: theme => {
      return {
        label: {
          fontWeight: 700,
          color: theme.colors.text[2],
        },
        description: {
          marginBottom: theme.spacing.md,
        },
      };
    },
  },
});
