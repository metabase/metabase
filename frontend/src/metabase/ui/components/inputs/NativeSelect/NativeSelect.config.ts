import { type MantineThemeOverride, NativeSelect } from "@mantine/core";

import S from "./NativeSelect.module.css";

export const nativeSelectOverrides: MantineThemeOverride["components"] = {
  NativeSelect: NativeSelect.extend({
    classNames: {
      input: S.input,
    },
  }),
};
