import { useFormikContext } from "formik";
import type { Ref, FormHTMLAttributes, SyntheticEvent } from "react";
import { forwardRef } from "react";

import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

export interface FormProps
  extends BoxProps,
    FormHTMLAttributes<HTMLFormElement> {
  disabled?: boolean;
}

export const Form = forwardRef(function Form(
  { disabled, ...props }: FormProps,
  ref: Ref<HTMLFormElement>,
) {
  const { handleSubmit, handleReset } = useFormikContext();

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
