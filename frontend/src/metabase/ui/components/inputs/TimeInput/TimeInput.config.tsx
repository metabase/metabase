import { TimeInput } from "@mantine/dates";

import Styles from "./TimeInput.module.css";

export const timeInputOverrides = {
  TimeInput: TimeInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    classNames: {
      root: Styles.root,
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
