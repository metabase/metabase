import { forwardRef } from "react";
import type { Ref, SyntheticEvent } from "react";
import { useFormikContext } from "formik";
import { Box } from "metabase/ui";
import type { BoxProps } from "metabase/ui";

export interface FormProps extends BoxProps {
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
