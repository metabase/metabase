import { FileInput } from "@mantine/core";

import { FileInputValue } from "./FileInputValue";

export const fileInputOverrides = {
  FileInput: FileInput.extend({
    defaultProps: {
      size: "md",
      valueComponent: FileInputValue,
    },
  }),
};
