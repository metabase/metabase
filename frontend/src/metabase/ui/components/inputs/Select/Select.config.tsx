import { Select } from "@mantine/core";

import S from "./Select.module.css";
import { SelectItem } from "./SelectItem";

export const selectOverrides = {
  Select: Select.extend({
    defaultProps: {
      size: "md",
      maxDropdownHeight: 512,
      withScrollArea: false,
      renderOption: item => (
        <SelectItem {...item.option} selected={item.checked} />
      ),
      clearButtonProps: {
        color: "text-dark",
      },
      comboboxProps: {
        withinPortal: false,
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
    },
  }),
};
