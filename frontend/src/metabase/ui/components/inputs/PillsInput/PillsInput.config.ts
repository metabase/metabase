import { type MantineThemeOverride, PillsInput } from "@mantine/core";

import S from "./PillsInput.module.css";

export const pillsInputOverrides: MantineThemeOverride["components"] = {
  PillsInput: PillsInput.extend({
    defaultProps: {
      variant: "default",
    },
    classNames: {
      input: S.input,
    },
  }),
};
