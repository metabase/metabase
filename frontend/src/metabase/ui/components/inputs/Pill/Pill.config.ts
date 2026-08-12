import type { MantineThemeOverride, PillFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./Pill.module.css";

export const pillOverrides: MantineThemeOverride["components"] = {
  Pill: themeComponent<PillFactory>({
    defaultProps: {
      size: "sm",
    },
    classNames: {
      root: S.root,
      label: S.label,
      remove: S.remove,
    },
  }),
};
