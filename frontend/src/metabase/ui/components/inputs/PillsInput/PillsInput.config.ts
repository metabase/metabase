import type {
  MantineThemeOverride,
  PillsInputFactory,
  PillsInputFieldFactory,
} from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./PillsInput.module.css";

export const pillsInputOverrides: MantineThemeOverride["components"] = {
  PillsInput: themeComponent<PillsInputFactory>({
    defaultProps: {
      variant: "default",
    },
  }),
  PillsInputField: themeComponent<PillsInputFieldFactory>({
    classNames: {
      field: S.field,
    },
  }),
};
