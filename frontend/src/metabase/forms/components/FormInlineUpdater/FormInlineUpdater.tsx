import { useDebouncedCallback } from "@mantine/hooks";
import { useFormikContext } from "formik";
import { useCallback, useEffect, useRef } from "react";
import _ from "underscore";

import { FormObserver } from "metabase/forms";

type FormInlineUpdaterProps<T, TSuccess> = {
  update: (values: T) => Promise<TSuccess>;
  onSuccess?: (value: TSuccess) => void;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  /** If provided, called before each update. Return false to skip the update. */
  onBeforeUpdate?: (values: T) => Promise<boolean> | boolean;
};
const DEFAULT_INLINE_UPDATE_DEBOUNCE_MS = 300;

/**
 * Calls the update function when form values change.
 * Processes updates sequentially to avoid race conditions.
 *
 * Failed updates roll back to the latest successfully updated values.
 * Use `enableReinitialize` when the form should also adopt changing external `initialValues`.
 *
 * @param update - Async function called with new form values
 * @param onSuccess - Optional callback called with the update result on success
 * @param onError - Optional callback called with the error on failure
 * @param debounceMs - Delay in ms before calling update (default: 300)
 * @param onBeforeUpdate - Optional callback called before each update. Return false to skip the update.
 *
 * @example
 * ```tsx
 * <FormProvider initialValues={...} onSubmit={_.noop} enableReinitialize>
 *   <Form>
 *     <FormInlineUpdater update={async (values) => await updateSettings(values)} debounceMs={300} />
 *     <FormTextInput name="field" />
 *   </Form>
 * </FormProvider>
 * ```
 */
export const FormInlineUpdater = <T, TSuccess>({
  update,
  onSuccess,
  onError,
  debounceMs = DEFAULT_INLINE_UPDATE_DEBOUNCE_MS,
  onBeforeUpdate,
}: FormInlineUpdaterProps<T, TSuccess>) => {
  const { initialValues, resetForm } = useFormikContext<T>();
  const updateInProgress = useRef(false);
  const pendingUpdate = useRef<T | null>(null);
  const lastSuccessfulValues = useRef(initialValues);

  useEffect(() => {
    if (!updateInProgress.current) {
      lastSuccessfulValues.current = initialValues;
    }
  }, [initialValues]);

  const processUpdate = useCallback(
    async (values: T) => {
      // If an update is already in progress, defer this one
      if (updateInProgress.current) {
        pendingUpdate.current = values;
        return;
      }

      updateInProgress.current = true;

      try {
        const result = await update(values);
        lastSuccessfulValues.current = values;
        onSuccess?.(result);
      } catch (err) {
        // On error, discard any pending updates and restore the last saved values
        pendingUpdate.current = null;
        resetForm({ values: lastSuccessfulValues.current });
        onError?.(err);
        updateInProgress.current = false;
        return;
      }

      updateInProgress.current = false;

      // Process pending update if one arrived while we were updating
      if (pendingUpdate.current) {
        const nextValues = pendingUpdate.current;
        pendingUpdate.current = null;
        await processUpdate(nextValues);
      }
    },
    [update, onSuccess, onError, resetForm],
  );

  const handleChange = useDebouncedCallback(async (values: T) => {
    // Skip update if values haven't changed from initialValues (i.e., user hasn't made changes)
    // This ensures we only trigger updates for user actions, not for programmatic updates
    // from API responses or Redux state changes that update initialValues
    if (_.isEqual(values, initialValues)) {
      return;
    }

    if (onBeforeUpdate) {
      const shouldProceed = await onBeforeUpdate(values);
      if (!shouldProceed) {
        return;
      }
    }

    await processUpdate(values);
  }, debounceMs);

  return <FormObserver onChange={handleChange} skipInitialCall />;
};
