/**
 * @deprecated
 */
export type FieldName = string;

/**
 * @deprecated
 */
export type DefaultFieldValue = unknown;

/**
 * @deprecated
 */
export type FieldValues = Record<FieldName, DefaultFieldValue>;

type FieldValidateResultOK = undefined;
type FieldValidateResultError = string;

// Extending Record type here as field definition's props
// will be just spread to the final field widget
// (e.g. autoFocus, placeholder)
/**
 * @deprecated
 */
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

  initial?: (value: unknown) => DefaultFieldValue;
  validate?: (
    value: DefaultFieldValue,
  ) => FieldValidateResultOK | FieldValidateResultError;
  normalize?: (value: unknown) => DefaultFieldValue;
};

/**
 * @deprecated
 */
export type StandardFormFieldDefinition = BaseFieldDefinition & {
  // If not is not provided, we're going to use default text input
  type?: string | (() => JSX.Element);
};

/**
 * @deprecated
 */
export type CustomFormFieldDefinition = BaseFieldDefinition & {
  widget: () => JSX.Element;
};

/**
 * @deprecated
 */
export type FormFieldDefinition =
  | StandardFormFieldDefinition
  | CustomFormFieldDefinition;

/**
 * @deprecated
 */
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

/**
 * @deprecated
 */
export type FormObject = {
  fields:
    | FormFieldDefinition[]
    | ((values?: FieldValues) => FormFieldDefinition[]);
};

/**
 * @deprecated
 */
export type PopulatedFormObject = {
  fields: (values?: FieldValues) => FormFieldDefinition[];
  fieldNames: (values: FieldValues) => FieldName[];
  hidden: (obj: unknown) => void;
  initial: (obj: unknown) => void;
  normalize: (obj: unknown) => void;
  validate: (obj: unknown) => void;
  disablePristineSubmit?: boolean;
};
