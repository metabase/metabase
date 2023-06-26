import { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { assocIn, getIn, merge } from "icepick";

// eslint-disable-next-line import/named
import { Formik, FormikErrors, FormikHelpers } from "formik";

import {
  BaseFieldValues,
  FormFieldDefinition,
  FormObject,
  FieldValues,
  PopulatedFormObject,
} from "metabase-types/forms";

import { OptionalFormViewProps } from "metabase/components/form/FormikCustomForm/types";

import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";

import { makeFormObject, cleanObject, isNestedFieldName } from "../formUtils";
import FormikFormViewAdapter from "./FormikFormViewAdapter";
import useInlineFields from "./useInlineFields";

interface FormContainerProps<Values extends BaseFieldValues>
  extends OptionalFormViewProps {
  form?: FormObject<Values>;

  fields?: FormFieldDefinition[];
  initialValues?: Partial<Values>;

  overwriteOnInitialValuesChange?: boolean;

  validate?: () => void;
  asyncValidate?: (values: FieldValues) => Promise<FieldValues | string>;
  initial?: () => void;
  normalize?: () => void;

  onValuesChange?: (newValues: Record<string, any>) => void;
  onSubmit: (
    values: Values,
    formikHelpers?: FormikHelpers<Values>,
  ) => void | Promise<void>;
  onSubmitSuccess?: (action: unknown) => void;

  // various props
  isModal?: boolean;
  submitTitle?: string;
  onClose?: () => void;
  footerExtraButtons?: any;
  disablePristineSubmit?: boolean;
  children?: ReactNode | ((opts: any) => any);
}

function maybeBlurActiveElement() {
  // HACK: blur the current element to ensure we show the error
  if (document.activeElement && "blur" in document.activeElement) {
    (document.activeElement as HTMLInputElement).blur();
  }
}

/**
 * @deprecated
 */
function Form<Values extends BaseFieldValues>({
  form,
  fields,
  initialValues: initialValuesProp = {},
  overwriteOnInitialValuesChange = false,
  asyncValidate,
  validate,
  initial,
  normalize,
  onValuesChange,
  onSubmit,
  onSubmitSuccess,
  ...props
}: FormContainerProps<Values>) {
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({});

  const handleValuesChange = (newValues: any) => {
    onValuesChange?.(newValues);
    setValues(newValues);
  };

  const { inlineFields, registerFormField, unregisterFormField } =
    useInlineFields();

  const formDefinition = useMemo(() => {
    const formDef = form || {
      fields: fields || Object.values(inlineFields),
      validate,
      initial,
      normalize,
    };
    return {
      ...formDef,
      fields: (values: Values) => {
        const fieldList =
          typeof formDef.fields === "function"
            ? formDef.fields(values)
            : formDef.fields;
        return fieldList.map(fieldDef => ({
          ...fieldDef,
          ...inlineFields[fieldDef.name],
        }));
      },
    };
  }, [form, fields, inlineFields, validate, initial, normalize]);

  const formObject: PopulatedFormObject<Values> = useMemo(
    () => makeFormObject(formDefinition),
    [formDefinition],
  );

  const initialValues = useMemo(() => {
    const fieldNames = formObject.fieldNames(values);
    const [nestedFieldNames, regularFieldNames] = _.partition(
      fieldNames,
      isNestedFieldName,
    );

    let filteredInitialValues: FieldValues = {};

    Object.keys(initialValuesProp || {}).forEach(fieldName => {
      if (regularFieldNames.includes(fieldName)) {
        filteredInitialValues[fieldName] = initialValuesProp[fieldName];
      }
    });

    nestedFieldNames.forEach(nestedFieldName => {
      const fieldValuePath = (nestedFieldName as string).split(".");
      filteredInitialValues = assocIn(
        filteredInitialValues,
        fieldValuePath,
        getIn(initialValuesProp, fieldValuePath),
      );
    });

    return merge(formObject.initial(values), filteredInitialValues);
  }, [values, initialValuesProp, formObject]);

  const fieldNames = useMemo(
    () => formObject.fieldNames({ ...initialValues, ...values }),
    [formObject, values, initialValues],
  );

  const handleValidation = useCallback(
    async (values: Values) => {
      const result = formObject.validate(values, { values });

      // Ensure errors don't have empty strings
      // as they will also be treated as errors
      let errors = cleanObject(result);

      if (asyncValidate) {
        const asyncErrors = await asyncValidate(values);
        if (typeof asyncErrors === "object") {
          errors = merge(cleanObject(asyncErrors), errors);
        } else if (typeof asyncErrors === "string") {
          setError(asyncErrors);
        }
      }

      return errors;
    },
    [asyncValidate, formObject],
  );

  const handleError = useCallback(
    (error: GenericErrorResponse, formikHelpers: FormikHelpers<Values>) => {
      maybeBlurActiveElement();
      const DEFAULT_ERROR_MESSAGE = t`An error occurred`;

      if (typeof error?.data === "object" && error?.data?.errors) {
        const errorNames = Object.keys(error.data.errors);
        const hasUnknownFields = errorNames.some(
          name => !fieldNames.includes(name),
        );

        if (hasUnknownFields) {
          const generalMessage = getResponseErrorMessage(error);
          setError(generalMessage ?? DEFAULT_ERROR_MESSAGE);
        }

        formikHelpers.setErrors(error.data.errors as FormikErrors<Values>);
        return error.data.errors;
      }

      if (error) {
        const message = getResponseErrorMessage(error);
        setError(message ?? DEFAULT_ERROR_MESSAGE);
        return message;
      }

      return DEFAULT_ERROR_MESSAGE;
    },
    [fieldNames],
  );

  const handleSubmit = useCallback(
    async (values: Values, formikHelpers: FormikHelpers<Values>) => {
      try {
        const normalized = formObject.normalize(values);
        const result = await onSubmit(normalized, formikHelpers);
        onSubmitSuccess?.(result);
        setError(null); // clear any previous errors
        return result;
      } catch (e) {
        const error = handleError(e as GenericErrorResponse, formikHelpers);
        // Need to throw, so e.g. submit button can react to an error
        throw error;
      }
    },
    [formObject, onSubmit, onSubmitSuccess, handleError],
  );

  return (
    <Formik<Values>
      validateOnBlur
      validateOnMount
      initialValues={initialValues}
      enableReinitialize={overwriteOnInitialValuesChange}
      validate={handleValidation}
      onSubmit={handleSubmit}
    >
      {formikProps => (
        <FormikFormViewAdapter<Values>
          {...formikProps}
          {...props}
          formObject={formObject}
          error={error}
          registerFormField={registerFormField}
          unregisterFormField={unregisterFormField}
          onValuesChange={handleValuesChange}
        />
      )}
    </Formik>
  );
}

export {
  CustomFormField as FormField,
  CustomFormSubmit as FormSubmit,
  CustomFormMessage as FormMessage,
  CustomFormFooter as FormFooter,
  CustomFormSection as FormSection,
} from "metabase/components/form/FormikCustomForm";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Form;
