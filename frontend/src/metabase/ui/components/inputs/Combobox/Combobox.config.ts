import { Combobox, type MantineThemeOverride } from "@mantine/core";

import ComboboxStyles from "./Combobox.module.css";

export const comboboxOverrides: MantineThemeOverride["components"] = {
  Combobox: Combobox.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      empty: ComboboxStyles.empty,
      option: ComboboxStyles.option,
    },
  }),
};
