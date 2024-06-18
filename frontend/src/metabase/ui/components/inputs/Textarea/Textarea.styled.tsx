import type { MantineThemeOverride } from "@mantine/core";

export const getTextareaOverrides = (): MantineThemeOverride["components"] => ({
  Textarea: {
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
    },
  },
});
