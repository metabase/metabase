import { TimeInput } from "@mantine/dates";

import Styles from "./TimeInput.module.css";

export const timeInputOverrides = {
  TimeInput: TimeInput.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      root: Styles.root,
      input: Styles.input,
    },
  }),
};
