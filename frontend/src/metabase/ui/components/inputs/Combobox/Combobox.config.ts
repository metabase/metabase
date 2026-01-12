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
      /**
       * The default value was changed in v8.2.3 from `true` to `false`. The
       * problem is, however, that there is an infinite loop in the Popover
       * that keeps flipping the `placement` if the component is unmounted.
       * That's why we need to keep it `true` to avoid a regression. At the time
       * of writing, the only e2e test that caught this is "should apply
       * conditional formatting" in `pivot_tables.cy.spec.js`.
       */
      keepMounted: true,
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
