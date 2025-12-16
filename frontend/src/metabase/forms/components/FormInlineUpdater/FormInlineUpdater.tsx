import { useFormikContext } from "formik";
import { useCallback, useRef } from "react";

import { FormObserver } from "../FormObserver";

export interface FormInlineUpdaterProps<T> {
  update: (values: T) => Promise<void>;
}

/**
 * A component that provides automatic rollback functionality for Formik forms.
 * When form values change, it attempts to call the update function.
 * If the update fails, it automatically rolls back to the last successful values.
 *
 * This component combines FormObserver with rollback logic for inline form updates.
 *
 * @param update - Async function to call when form values change
 *
 * @example
 * ```tsx
 * <FormProvider initialValues={...} onSubmit={_.noop}>
 *   <Form>
 *     <FormInlineUpdater update={async (values) => await updateSettings(values)} />
 *     <FormTextInput name="field" />
 *   </Form>
 * </FormProvider>
 * ```
 */
export const FormInlineUpdater = <T,>({
  update,
}: FormInlineUpdaterProps<T>) => {
  const { setValues, initialValues } = useFormikContext<T>();
  const lastSuccessfulValues = useRef<T>(initialValues);
  const skipNextChange = useRef(false);

  const handleChange = useCallback(
    async (values: T) => {
      if (skipNextChange.current) {
        skipNextChange.current = false;
        return;
      }

      // Store initial values on first call if not provided
      if (lastSuccessfulValues.current === null) {
        lastSuccessfulValues.current = values;
      }

      try {
        await update(values);
        lastSuccessfulValues.current = values;
      } catch (err) {
        if (lastSuccessfulValues.current !== null) {
          skipNextChange.current = true;
          await setValues(lastSuccessfulValues.current);
        }
      }
    },
    [update, setValues],
  );

  return <FormObserver onChange={handleChange} skipInitialCall deepCompare />;
};
