import { type MantineThemeOverride, Pill } from "@mantine/core";

import S from "./Pill.module.css";

export const pillOverrides: MantineThemeOverride["components"] = {
  Pill: Pill.extend({
    classNames: {
      root: S.root,
      remove: S.remove,
    },
  }),
};
