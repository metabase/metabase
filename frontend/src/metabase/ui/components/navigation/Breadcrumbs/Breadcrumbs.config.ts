import type { BreadcrumbsFactory, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./Breadcrumbs.module.css";

export const breadcrumbsOverrides: MantineThemeOverride["components"] = {
  Breadcrumbs: themeComponent<BreadcrumbsFactory>({
    classNames: {
      separator: S.separator,
    },
  }),
};
