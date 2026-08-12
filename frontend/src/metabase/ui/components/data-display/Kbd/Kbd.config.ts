import type { KbdFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./Kbd.module.css";

export const kbdOverrides = {
  Kbd: themeComponent<KbdFactory>({
    classNames: {
      root: S.root,
    },
  }),
};
