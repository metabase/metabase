import type { MantineThemeOverride } from "@mantine/core";
import { getSize } from "@mantine/core";

export const getTextareaOverrides = (): MantineThemeOverride["components"] => ({
  Textarea: {
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
    },
    styles: (theme, _, { size = "md" }) => ({
      wrapper: {
        "&:not(:only-child)": {
          marginTop: theme.spacing.xs,
        },
      },
      label: {
        color: theme.fn.themeColor("text-medium"),
        fontSize: getSize({ size, sizes: theme.fontSizes }),
      },
    }),
  },
});
