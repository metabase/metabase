import { TextInput } from "@mantine/core";

import Styles from "./TextInput.module.css";

export const textInputOverrides = {
  TextInput: TextInput.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      input: Styles.input,
    },
  }),
};
