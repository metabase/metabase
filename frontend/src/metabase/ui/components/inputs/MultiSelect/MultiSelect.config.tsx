import { MultiSelect } from "@mantine/core";

import { DefaultSelectItem, selectOverrides } from "../Select";

import S from "./MultiSelect.module.css";

export const multiSelectOverrides = {
  MultiSelect: MultiSelect.extend({
    defaultProps: {
      radius: "sm",
      size: "md",
      variant: "default",
      maxDropdownHeight: 512,
      hidePickedOptions: true,
      renderOption: (props) => (
        <DefaultSelectItem {...props.option} selected={props.checked} />
      ),
      withScrollArea: false,
      comboboxProps: {
        withinPortal: true,
        keepMounted: false,
      },
      clearButtonProps: {
        color: "text-primary",
      },
      "data-testid": "multi-select",
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    classNames: {
      ...(selectOverrides?.Select?.classNames ?? {}),
      input: S.MultiSelectInput,
    },
  }),
};
