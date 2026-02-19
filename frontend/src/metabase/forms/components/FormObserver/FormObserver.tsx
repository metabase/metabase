import { useFormikContext } from "formik";
import { useEffect, useRef } from "react";

interface FormObserverProps<T> {
  onChange: (values: T) => void;
  skipInitialCall?: boolean;
}

/** This component can be used to effectivy add an onChange handler to a from.
    however, this should be used with caution as it is bad practice to duplicate
    state. */
export const FormObserver = <T,>({
  onChange,
  skipInitialCall = false,
}: FormObserverProps<T>) => {
  const { values } = useFormikContext<T>();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (skipInitialCall && isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (values) {
      onChange(values);
    }
  }, [values, onChange, skipInitialCall]);

  return null;
};
