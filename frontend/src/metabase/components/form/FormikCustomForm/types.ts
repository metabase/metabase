import PropTypes from "prop-types";

import type {
  FieldName,
  BaseFieldValues,
  DefaultFieldValue,
  FormFieldDefinition,
  FormField,
  PopulatedFormObject,
} from "metabase-types/forms";

export interface BaseFormProps<Values extends BaseFieldValues> {
  formKey?: string;
  formName?: string;
  formObject: PopulatedFormObject<Values>;

  formFields: FormFieldDefinition[];
  formFieldsByName: Record<string, FormFieldDefinition>;
  disablePristineSubmit?: boolean;

  registerFormField: (fieldDef: FormFieldDefinition) => void;
  unregisterFormField: (fieldDef: FormFieldDefinition) => void;

  fields: Record<keyof Values, FormField<Values>>;
  values: Values;
  errors: Record<keyof Values, string>;

  active?: boolean;
  asyncValidating?: boolean;
  dirty: boolean;
  error?: string | null;
  invalid: boolean;
  overwriteOnInitialValuesChange?: boolean;
  pristine: boolean;
  readonly?: boolean;
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

  submitPassback?: () => void;
  touch?: () => void;
  touchAll?: () => void;
  untouch?: () => void;
  untouchAll?: () => void;
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

export interface FormLegacyContext<
  Values extends BaseFieldValues = BaseFieldValues,
> extends OptionalFormViewProps,
    Pick<
      BaseFormProps<Values>,
      | "formFields"
      | "formFieldsByName"
      | "registerFormField"
      | "unregisterFormField"
      | "disablePristineSubmit"
      | "handleSubmit"
      | "fields"
      | "values"
      | "submitting"
      | "invalid"
      | "pristine"
      | "error"
      | "onChangeField"
    > {}

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
