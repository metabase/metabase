import { useFormikContext } from "formik";
import { useEffect } from "react";

interface FormObserverProps<T> {
  onChange: (vals: T) => void;
}

/** This component can be used to effectivy add an onChange handler to a from.
    however, this should be used with caution as it is bad practice to duplicate
    state. */
export const FormObserver = <T,>({ onChange }: FormObserverProps<T>) => {
  const { values } = useFormikContext<T>();

  useEffect(() => {
    if (values) {
      onChange(values);
    }
  }, [values, onChange]);

  return null;
};
