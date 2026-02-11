import { Select } from "@mantine/core";
import { t } from "ttag";

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
        // eslint-disable-next-line ttag/no-module-declaration
        "aria-label": t`Clear`,
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
      error: S.SelectError,
      section: S.SelectInputSection,
      option: S.SelectItems_Item,
      options: S.SelectItems_Options,
      group: S.SelectItems_Group,
      groupLabel: S.SelectItems_GroupLabel,
      empty: S.SelectItemsNothingFound,
      dropdown: S.Dropdown,
    },
  }),
};
