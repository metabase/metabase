import type { NumberInputFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import Styles from "./NumberInput.module.css";

export const numberInputOverrides = {
  NumberInput: themeComponent<NumberInputFactory>({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
      hideControls: true,
    },
    classNames: {
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
