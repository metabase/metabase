import { FileInput } from "@mantine/core";

import Styles from "./FileInput.module.css";
import { FileInputValue } from "./FileInputValue";

export const fileInputOverrides = {
  FileInput: FileInput.extend({
    defaultProps: {
      size: "md",
      valueComponent: FileInputValue,
    },
    classNames: {
      placeholder: Styles.FileInputPlaceholder,
      section: Styles.FileInputSection,
    },
  }),
};
