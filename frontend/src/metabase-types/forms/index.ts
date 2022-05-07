export type FieldName = string;
export type DefaultFieldValue = unknown;

export type FieldValues = Record<FieldName, DefaultFieldValue>;

type FieldValidateResultOK = undefined;
type FieldValidateResultError = string;

export type BaseFieldDefinition = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  placeholder?: string;
  hidden?: boolean;

  info?: string;
  infoLabel?: string;
  infoLabelTooltip?: string;

  align?: "left" | "right";
  horizontal?: boolean;
  descriptionPosition?: "top" | "bottom";
  visibleIf?: Record<FieldName, unknown>;

  initial?: (value: unknown) => DefaultFieldValue;
  validate?: (
    value: DefaultFieldValue,
  ) => FieldValidateResultOK | FieldValidateResultError;
  normalize?: (value: unknown) => DefaultFieldValue;
};

export type StandardFormFieldDefinition = BaseFieldDefinition & {
  type: string | (() => JSX.Element);
};

export type CustomFormFieldDefinition = BaseFieldDefinition & {
  widget: () => JSX.Element;
};

export type FormFieldDefinition =
  | StandardFormFieldDefinition
  | CustomFormFieldDefinition;

export type FormField<Value = DefaultFieldValue> = {
  name: FieldName;
  value: Value;
  error?: string;
  initialValue: Value;

  active: boolean;
  dirty: boolean;
  invalid: boolean;
  pristine: boolean;
  touched: boolean;
  valid: boolean;
  visited: boolean;

  onBlur: () => void;
  onFocus: () => void;
};

export type FormObject = {
  fields: (values: FieldValues) => FormFieldDefinition[];
  fieldNames: (values: FieldValues) => FieldName[];
  hidden: (obj: unknown) => void;
  initial: (obj: unknown) => void;
  normalize: (obj: unknown) => void;
  validate: (obj: unknown) => void;
  disablePristineSubmit?: boolean;
};
