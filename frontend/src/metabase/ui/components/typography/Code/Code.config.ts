import { Code, type MantineThemeOverride } from "@mantine/core";

import CodeStyles from "./Code.module.css";

export const codeOverrides = (MantineThemeOverride["components"] = {
  Code: Code.extend({
    classNames: {
      root: CodeStyles.root,
    },
  }),
});
