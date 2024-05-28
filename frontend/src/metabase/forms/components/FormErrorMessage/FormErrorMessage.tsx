import type { Ref } from "react";
import { forwardRef } from "react";

import type { TextProps } from "metabase/ui";
import { Text } from "metabase/ui";

import { useFormErrorMessage } from "../../hooks";

export type FormErrorMessageProps = TextProps;

export const FormErrorMessage = forwardRef(function FormErrorMessage(
  props: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const message = useFormErrorMessage();
  if (!message) {
    return null;
  }

  return (
    <Text {...props} role="alert" aria-label={message} ref={ref} color="error">
      {message}
    </Text>
  );
});
