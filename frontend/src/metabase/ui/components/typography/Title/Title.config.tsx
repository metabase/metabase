import type { MantineThemeOverride, TitleFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

export const titleOverrides: MantineThemeOverride["components"] = {
  Title: themeComponent<TitleFactory>({
    classNames: {},
  }),
};
