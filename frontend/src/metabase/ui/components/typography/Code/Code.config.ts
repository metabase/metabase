import type { CodeFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import CodeStyles from "./Code.module.css";

export const codeOverrides = {
  Code: themeComponent<CodeFactory>({
    classNames: {
      root: CodeStyles.root,
    },
  }),
};
