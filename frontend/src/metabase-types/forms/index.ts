export type FieldName = string;
export type DefaultFieldValue = unknown;

export type FieldValues = Record<FieldName, DefaultFieldValue>;

export type BaseFieldValues = {
  [field: string]: any;
};

type FieldValidateResultOK = undefined | null | false;
type FieldValidateResultError = string;

// Extending Record type here as field definition's props
// will be just spread to the final field widget
// (e.g. autoFocus, placeholder)
export type BaseFieldDefinition = Record<string, unknown> & {
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

  initial?: () => DefaultFieldValue;
  validate?: (value: any) => FieldValidateResultOK | FieldValidateResultError;
  normalize?: (value: any) => DefaultFieldValue;
};

export type StandardFormFieldDefinition = BaseFieldDefinition & {
  // If not is not provided, we're going to use default text input
  type?: string | (() => JSX.Element);
};

export type CustomFormFieldDefinition = BaseFieldDefinition & {
  widget: () => JSX.Element;
};

export type FormFieldDefinition =
  | StandardFormFieldDefinition
  | CustomFormFieldDefinition;

export type FormField<Values, Value = DefaultFieldValue> = {
  name: keyof Values;
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
  onChange: (value: Value) => void;
};

export type FormObject<Values> = {
  fields: FormFieldDefinition[] | ((values?: Values) => FormFieldDefinition[]);
};

export type PopulatedFormObject<Values extends BaseFieldValues> = {
  fields: (values?: Values) => FormFieldDefinition[];
  fieldNames: (values?: Partial<Values>) => (keyof Values)[];
  hidden: (obj: unknown) => void;
  initial: (values?: Partial<Values>) => Values;
  normalize: (values: Values) => Values;
  validate: (obj: unknown, opts: { values: Values }) => void;
  disablePristineSubmit?: boolean;
};
