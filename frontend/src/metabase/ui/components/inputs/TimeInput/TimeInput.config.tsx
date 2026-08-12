import type { TimeInputFactory } from "@mantine/dates";

import { themeComponent } from "../../../utils/theme-component";

import Styles from "./TimeInput.module.css";

export const timeInputOverrides = {
  TimeInput: themeComponent<TimeInputFactory>({
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
