import { type MantineThemeOverride, Textarea } from "@mantine/core";

export const textareaOverrides: MantineThemeOverride["components"] = {
  Textarea: Textarea.extend({
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
    },
  }),
};
