import type { TextInputFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import Styles from "./TextInput.module.css";

export const textInputOverrides = {
  TextInput: themeComponent<TextInputFactory>({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
    },
    classNames: {
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
