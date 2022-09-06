import type {
  ActionFormSettings,
  FieldSettings,
} from "metabase-types/api/writeback";

export const getDefaultFormSettings = (): ActionFormSettings => ({
  name: "",
  type: "inline",
  description: "",
  fields: {},
  confirmMessage: "",
});

export const getDefaultFieldSettings = (): FieldSettings => ({
  name: "",
  order: 0,
  description: "",
  placeholder: "",
  fieldType: "text",
  inputType: "text",
  required: false,
  hidden: false,
  width: "md",
});
