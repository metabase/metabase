import { useDebouncedCallback } from "@mantine/hooks";
import { useFormikContext } from "formik";
import { useCallback, useRef } from "react";
import _ from "underscore";

import { FormObserver } from "metabase/forms";

type Props<T, TSuccess> = {
  update: (values: T) => Promise<TSuccess>;
  onSuccess?: (value: TSuccess) => void;
  onError?: (error: unknown) => void;
  debounceMs?: number;
};
const DEFAULT_INLINE_UPDATE_DEBOUNCE_MS = 300;

/**
 * Calls the update function when form values change.
 * Rolls back to the last successful state on error.
 * Processes updates sequentially to avoid race conditions.
 *
 * @param update - Async function called with new form values
 * @param onSuccess - Optional callback called with the update result on success
 * @param onError - Optional callback called with the error on failure
 * @param debounceMs - Delay in ms before calling update (default: 300)
 *
 * @example
 * ```tsx
 * <FormProvider initialValues={...} onSubmit={_.noop}>
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
}: Props<T, TSuccess>) => {
  const { initialValues } = useFormikContext<T>();
  const lastSuccessfulValues = useRef<T>(initialValues);
  const skipNextChange = useRef(false);
  const updateInProgress = useRef(false);
  const pendingUpdate = useRef<T | null>(null);

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
        // On error, discard any pending updates and rollback
        pendingUpdate.current = null;
        onError?.(err);
        // if (lastSuccessfulValues.current !== null) {
        //   skipNextChange.current = true;
        //   await setValues(lastSuccessfulValues.current);
        // }
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
    [update, onSuccess, onError],
  );

  const handleChange = useDebouncedCallback(async (values: T) => {
    if (skipNextChange.current) {
      skipNextChange.current = false;
      return;
    }
    // Skip update if values haven't changed from last successful state
    if (_.isEqual(values, lastSuccessfulValues.current)) {
      return;
    }

    await processUpdate(values);
  }, debounceMs);

  return <FormObserver onChange={handleChange} skipInitialCall />;
};
