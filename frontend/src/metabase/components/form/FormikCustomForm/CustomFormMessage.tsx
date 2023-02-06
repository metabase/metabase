import React from "react";

import FormMessage from "metabase/components/form/FormMessage";

import { useForm } from "./context";

export interface CustomFormMessageProps {
  className?: string;
  noPadding?: boolean;
}

/**
 * @deprecated
 */
function CustomFormMessage(props: CustomFormMessageProps) {
  const { error } = useForm();
  if (error) {
    return <FormMessage {...props} message={error} />;
  }
  return null;
}

export default CustomFormMessage;
