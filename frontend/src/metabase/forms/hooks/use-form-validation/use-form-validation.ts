import type { FormikErrors, FormikValues } from "formik";
import { prepareDataForValidation, yupToFormErrors } from "formik";
import { useCallback, useMemo } from "react";
import type { AnySchema } from "yup";

export type ValidationSchema<T> = AnySchema | ((values: T) => AnySchema);

export interface UseFormValidationProps<T extends FormikValues, C> {
  initialValues: T;
  validationSchema?: ValidationSchema<T>;
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
        resolveSchema(validationSchema, initialValues),
        validationContext,
      );
    }
  }, [initialValues, validationSchema, validationContext]);

  const handleValidate = useCallback(
    (values: T) => {
      if (validationSchema) {
        return validateSchema(
          values,
          resolveSchema(validationSchema, values),
          validationContext,
        );
      }
    },
    [validationSchema, validationContext],
  );

  return {
    initialErrors,
    handleValidate,
  };
};

const resolveSchema = <T>(schema: ValidationSchema<T>, values: T) =>
  typeof schema === "function" ? schema(values) : schema;

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
