export type FieldName = string;
export type DefaultFieldValue = unknown;

export type FieldValues = Record<FieldName, DefaultFieldValue>;

export type BaseFieldDefinition = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  initial?: unknown;
  validate?: () => void;
  normalize?: () => void;
};

export type StandardFormFieldDefinition = BaseFieldDefinition & {
  type: string;
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
  initialValue: Value;

  active: boolean;
  autofilled: boolean;
  checked: boolean;
  dirty: boolean;
  invalid: boolean;
  pristine: boolean;
  touched: boolean;
  valid: boolean;
  visited: boolean;

  autofill: () => void;

  onBlur: () => void;
  onChange: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onFocus: () => void;
  onUpdate: () => void;
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
