import { TagsInput } from "@mantine/core";

import CS from "../Combobox/Combobox.module.css";
import { selectOverrides } from "../Select";

import S from "./TagsInput.module.css";

export const tagsInputOverrides = {
  TagsInput: TagsInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
      clearButtonProps: selectOverrides?.Select?.defaultProps?.clearButtonProps,
    },
    classNames: {
      input: S.input,
      inputField: S.inputField,
      pill: S.pill,
      pillsList: S.pillsList,
      dropdown: CS.dropdown,
      options: CS.options,
      option: CS.option,
      group: CS.group,
      groupLabel: CS.groupLabel,
      empty: CS.empty,
    },
  }),
};
