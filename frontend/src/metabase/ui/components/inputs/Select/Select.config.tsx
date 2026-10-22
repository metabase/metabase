import { Select } from "@mantine/core";
import cx from "classnames";
import { t } from "ttag";

import CS from "../Combobox/Combobox.module.css";

import S from "./Select.module.css";
import { DefaultSelectItem } from "./SelectItem";

export const selectOverrides = {
  Select: Select.extend({
    defaultProps: {
      size: "md",
      withScrollArea: false,
      allowDeselect: false,
      inputWrapperOrder: ["label", "description", "input", "error"],
      renderOption: (item) => (
        <DefaultSelectItem {...item.option} selected={item.checked} />
      ),
      clearButtonProps: {
        get "aria-label"() {
          return t`Clear`;
        },
        color: "text-primary",
        className: S.SelectClearButton,
      },
      comboboxProps: {
        withinPortal: true,
        keepMounted: false,
      },
    },
    classNames: {
      root: S.SelectRoot,
      input: S.SelectInput,
      wrapper: S.SelectWrapper,
      section: S.SelectInputSection,
      dropdown: CS.dropdown,
      options: cx(CS.options, S.SelectOptions),
      option: cx(CS.option, S.SelectItems_Item),
      group: CS.group,
      groupLabel: CS.groupLabel,
      empty: CS.empty,
    },
  }),
};
