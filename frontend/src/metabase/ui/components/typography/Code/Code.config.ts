import { Code } from "@mantine/core";

import CodeStyles from "./Code.module.css";

export const codeOverrides = {
  Code: Code.extend({
    classNames: {
      root: CodeStyles.root,
    },
  }),
};
