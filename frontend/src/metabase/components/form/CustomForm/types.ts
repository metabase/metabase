import PropTypes from "prop-types";
import {
  FieldName,
  DefaultFieldValue,
  FieldValues,
  FormFieldDefinition,
  FormField,
  FormObject,
} from "metabase-types/forms";

export interface BaseFormProps {
  formKey?: string;
  formName: string;
  formObject: FormObject;

  fields: Record<string, FormField>;
  values: FieldValues;
  errors: Record<FieldName, string>;

  active?: boolean;
  asyncValidating?: boolean;
  dirty: boolean;
  error?: string;
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
