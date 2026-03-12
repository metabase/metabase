import { NumberInput } from "@mantine/core";

import Styles from "./NumberInput.module.css";

export const numberInputOverrides = {
  NumberInput: NumberInput.extend({
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
