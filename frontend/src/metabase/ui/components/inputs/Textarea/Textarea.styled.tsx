import type { MantineThemeOverride } from "@mantine/core";

export const getTextareaOverrides = (): MantineThemeOverride["components"] => ({
  Textarea: {
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    styles: {
      error: { "&::first-letter": { textTransform: "capitalize" } },
    },
  },
});
