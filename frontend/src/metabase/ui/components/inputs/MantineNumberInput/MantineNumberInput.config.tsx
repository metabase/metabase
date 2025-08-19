import { NumberInput } from "@mantine/core";

import Styles from "./MantineNumberInput.module.css";

export const mantineNumberInputOverrides = {
  NumberInput: NumberInput.extend({
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
