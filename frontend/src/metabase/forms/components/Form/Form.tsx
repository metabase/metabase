import { useFormikContext } from "formik";
import type { Ref, FormHTMLAttributes, SyntheticEvent } from "react";
import { forwardRef, useEffect } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

export interface FormProps
  extends BoxProps,
    FormHTMLAttributes<HTMLFormElement> {
  disabled?: boolean;
  onValuesChange?: (values: any) => void;
}

export const Form = forwardRef(function Form(
  { disabled, onValuesChange, ...props }: FormProps,
  ref: Ref<HTMLFormElement>,
) {
  const { handleSubmit, handleReset, values } = useFormikContext();

  const previousValues = usePrevious(values);

  useEffect(() => {
    if (!_.isEqual(previousValues, values)) {
      onValuesChange?.(values);
    }
  }, [previousValues, values, onValuesChange]);

  return (
    <Box
      {...props}
      ref={ref}
      component="form"
      onSubmit={!disabled ? handleSubmit : handleDisabledEvent}
      onReset={!disabled ? handleReset : handleDisabledEvent}
    />
  );
});

const handleDisabledEvent = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};
