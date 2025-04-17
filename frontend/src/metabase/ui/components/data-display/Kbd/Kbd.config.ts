import { Kbd } from "@mantine/core";

import S from "./Kbd.module.css";

export const kbdOverrides = {
  Kbd: Kbd.extend({
    classNames: {
      root: S.root,
    },
  }),
};
