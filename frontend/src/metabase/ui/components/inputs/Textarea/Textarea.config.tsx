import { type MantineThemeOverride, Textarea } from "@mantine/core";

import TextInputStyles from "../TextInput/TextInput.module.css";

export const textareaOverrides: MantineThemeOverride["components"] = {
  Textarea: Textarea.extend({
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    classNames: {
      error: TextInputStyles.error,
    },
  }),
};
