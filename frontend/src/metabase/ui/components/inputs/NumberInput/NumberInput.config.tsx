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
      wrapper: Styles.wrapper,
      input: Styles.input,
      error: Styles.error,
      control: Styles.control,
    },
  }),
};
