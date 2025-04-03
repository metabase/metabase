import {
  type MantineThemeOverride,
  PillsInput,
  PillsInputField,
} from "@mantine/core";

import S from "./PillsInput.module.css";

export const pillsInputOverrides: MantineThemeOverride["components"] = {
  PillsInput: PillsInput.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      wrapper: S.wrapper,
      input: S.input,
    },
  }),
  PillsInputField: PillsInputField.extend({
    classNames: {
      field: S.field,
    },
  }),
};
