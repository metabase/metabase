import { type MantineThemeOverride, Title } from "@mantine/core";

import TitleStyles from "./Title.module.css";

export const titleOverrides: MantineThemeOverride["components"] = {
  Title: Title.extend({
    classNames: {
      root: TitleStyles.root,
    },
  }),
};
