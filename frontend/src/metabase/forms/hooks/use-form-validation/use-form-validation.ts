import type { FormikErrors, FormikValues } from "formik";
import { prepareDataForValidation, yupToFormErrors } from "formik";
import { useCallback, useMemo } from "react";
import type { AnySchema } from "yup";

export interface UseFormValidationProps<T extends FormikValues, C> {
  initialValues: T;
  validationSchema?: AnySchema;
  validationContext?: C;
}

export interface UseFormValidationResult<T extends FormikValues> {
  initialErrors: FormikErrors<T> | undefined;
  handleValidate: (values: T) => void | object | FormikErrors<T>;
}

export const useFormValidation = <T extends FormikValues, C>({
  initialValues,
  validationSchema,
  validationContext,
}: UseFormValidationProps<T, C>): UseFormValidationResult<T> => {
  const initialErrors = useMemo(() => {
    if (validationSchema) {
      return validateSchemaInitial(
        initialValues,
        validationSchema,
        validationContext,
      );
    }
  }, [initialValues, validationSchema, validationContext]);

  const handleValidate = useCallback(
    (values: FormikValues) => {
      if (validationSchema) {
        return validateSchema(values, validationSchema, validationContext);
      }
    },
    [validationSchema, validationContext],
  );

  return {
    initialErrors,
    handleValidate,
  };
};

const validateSchema = async <T extends FormikValues, C>(
  values: T,
  validationSchema: AnySchema,
  validationContext?: C,
) => {
  try {
    const data = prepareDataForValidation(values);
    await validationSchema.validate(data, {
      context: validationContext,
      abortEarly: false,
    });
  } catch (error) {
    return yupToFormErrors(error);
  }
};

const validateSchemaInitial = <T extends FormikValues, C>(
  values: T,
  validationSchema: AnySchema,
  validationContext?: C,
) => {
  try {
    const data = prepareDataForValidation(values);
    validationSchema.validateSync(data, { context: validationContext });
  } catch (error) {
    return yupToFormErrors(error);
  }
};
