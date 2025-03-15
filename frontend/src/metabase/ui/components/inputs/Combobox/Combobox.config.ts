import { Combobox } from "@mantine/core";

import ComboboxStyles from "./Combobox.module.css";

export const comboboxOverrides = {
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
