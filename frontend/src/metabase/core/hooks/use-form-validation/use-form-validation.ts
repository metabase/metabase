import { useCallback, useMemo } from "react";
import { prepareDataForValidation, yupToFormErrors } from "formik";
import type { FormikErrors, FormikValues } from "formik";
import type { AnySchema } from "yup";

export interface UseFormValidationProps<C> {
  initialValues?: FormikValues;
  validationSchema?: AnySchema;
  validationContext?: C;
}

export interface UseFormValidationResult<T> {
  initialErrors: FormikErrors<T> | undefined;
  handleValidate: (data: T) => void;
}

const useFormValidation = <T, C>({
  initialValues,
  validationSchema,
  validationContext,
}: UseFormValidationProps<C>): UseFormValidationResult<T> => {
  const initialErrors = useMemo(() => {
    if (validationSchema) {
      return validateSchemaSync(
        initialValues,
        validationSchema,
        validationContext,
      );
    }
  }, [initialValues, validationSchema, validationContext]);

  const handleValidate = useCallback(
    (values: T) => {
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

const validateSchema = async <T, C>(
  values: T,
  validationSchema: AnySchema,
  validationContext?: C,
) => {
  try {
    const data = prepareDataForValidation(values);
    await validationSchema.validate(data, { context: validationContext });
  } catch (error) {
    return yupToFormErrors(error);
  }
};

const validateSchemaSync = <T, C>(
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

export default useFormValidation;
