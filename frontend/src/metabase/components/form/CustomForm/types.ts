import PropTypes from "prop-types";

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

export interface BaseFormProps {
  formKey?: string;
  formName: string;
  formObject: FormObject;

  fields: FormField[];
  values: FieldValues;
  errors: Record<FieldName, string>;

  active?: boolean;
  asyncValidating: boolean;
  dirty: boolean;
  error?: unknown;
  invalid: boolean;
  overwriteOnInitialValuesChange?: boolean;
  pristine: boolean;
  readonly: boolean;
  submitFailed: boolean;
  submitting: boolean;
  valid: boolean;

  asyncValidate: () => void;
  destroyForm: () => void;
  handleSubmit: () => void;
  initializeForm: () => void;
  onChangeField: (fieldName: FieldName, value: DefaultFieldValue) => void;
  onSubmitSuccess: () => void;
  resetForm: () => void;
  submitPassback: () => void;
  touch: () => void;
  touchAll: () => void;
  untouch: () => void;
  untouchAll: () => void;
}

type RenderSubmitProps = {
  title: React.ReactNode;
  canSubmit: boolean;
  handleSubmit: () => void;
};

export interface OptionalFormViewProps {
  submitTitle?: string;
  renderSubmit?: (props: RenderSubmitProps) => JSX.Element;
  className?: string;
  style?: React.CSSProperties;
}

export interface FormLegacyContext
  extends OptionalFormViewProps,
    Pick<
      BaseFormProps,
      | "handleSubmit"
      | "fields"
      | "values"
      | "submitting"
      | "invalid"
      | "pristine"
      | "error"
      | "onChangeField"
    > {
  formFields: FormFieldDefinition[];
  formFieldsByName: Record<FieldName, FormFieldDefinition>;
  disablePristineSubmit?: boolean;
}

export const LegacyContextTypes = {
  handleSubmit: PropTypes.func,
  submitTitle: PropTypes.string,
  renderSubmit: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
  fields: PropTypes.object,
  formFields: PropTypes.array,
  formFieldsByName: PropTypes.object,
  values: PropTypes.object,
  submitting: PropTypes.bool,
  invalid: PropTypes.bool,
  pristine: PropTypes.bool,
  error: PropTypes.string,
  onChangeField: PropTypes.func,
  disablePristineSubmit: PropTypes.bool,
};
