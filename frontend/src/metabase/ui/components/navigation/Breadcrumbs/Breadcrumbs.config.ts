import { Breadcrumbs, type MantineThemeOverride } from "@mantine/core";

import S from "./Breadcrumbs.module.css";

export const breadcrumbsOverrides: MantineThemeOverride["components"] = {
  Breadcrumbs: Breadcrumbs.extend({
    defaultProps: {
      separatorMargin: "xxs",
    },
    classNames: {
      separator: S.separator,
    },
  }),
};
