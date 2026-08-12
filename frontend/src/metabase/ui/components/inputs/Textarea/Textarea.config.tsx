import type { MantineThemeOverride, TextareaFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";
import TextInputStyles from "../TextInput/TextInput.module.css";

export const textareaOverrides: MantineThemeOverride["components"] = {
  Textarea: themeComponent<TextareaFactory>({
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
    styles: {
      input: { lineHeight: "normal" },
    },
  }),
};
