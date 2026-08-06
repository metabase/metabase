import { type MantineThemeOverride, Pill } from "@mantine/core";

import S from "./Pill.module.css";

export const pillOverrides: MantineThemeOverride["components"] = {
  Pill: Pill.extend({
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
