import {
  Combobox,
  ComboboxChevron,
  type MantineThemeOverride,
} from "@mantine/core";

import S from "./Combobox.module.css";

export const comboboxOverrides: MantineThemeOverride["components"] = {
  Combobox: Combobox.extend({
    defaultProps: {
      size: "md",
      keepMounted: true, // the default value was changed in v8.2.3
    },
    classNames: {
      options: S.options,
      option: S.option,
      empty: S.empty,
    },
  }),
  ComboboxChevron: ComboboxChevron.extend({
    classNames: {
      chevron: S.chevron,
    },
  }),
};
