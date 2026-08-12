import type { FileInputFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import { FileInputValue } from "./FileInputValue";

export const fileInputOverrides = {
  FileInput: themeComponent<FileInputFactory>({
    defaultProps: {
      size: "md",
      valueComponent: FileInputValue,
    },
  }),
};
