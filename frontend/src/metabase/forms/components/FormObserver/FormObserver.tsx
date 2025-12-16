import { usePrevious } from "@mantine/hooks";
import { useFormikContext } from "formik";
import { useEffect, useRef } from "react";
import _ from "underscore";

interface FormObserverProps<T> {
  onChange: (values: T) => void;
  skipInitialCall?: boolean;
  deepCompare?: boolean;
}

/** This component can be used to effectivy add an onChange handler to a from.
    however, this should be used with caution as it is bad practice to duplicate
    state. */
export const FormObserver = <T,>({
  onChange,
  skipInitialCall = false,
  deepCompare = false,
}: FormObserverProps<T>) => {
  const { values } = useFormikContext<T>();
  const previousValues = usePrevious(values);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (skipInitialCall && isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (deepCompare && _.isEqual(values, previousValues)) {
      return;
    }

    if (values) {
      onChange(values);
    }
  }, [values, previousValues, onChange, skipInitialCall, deepCompare]);

  return null;
};
