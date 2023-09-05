import type { Ref } from "react";
import { forwardRef } from "react";
import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";
import { useFormErrorMessage } from "../../hooks";

export type FormErrorMessageProps = BoxProps;

export const FormErrorMessage = forwardRef(function FormErrorMessage(
  props: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const message = useFormErrorMessage();
  if (!message) {
    return null;
  }

  return (
    <Box {...props} ref={ref}>
      {message}
    </Box>
  );
});
