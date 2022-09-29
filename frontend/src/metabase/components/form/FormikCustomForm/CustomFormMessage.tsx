import React from "react";
import _ from "underscore";

import FormMessage from "metabase/components/form/FormMessage";

import { useForm } from "./context";

export interface CustomFormMessageProps {
  className?: string;
  noPadding?: boolean;
}

function CustomFormMessage(props: CustomFormMessageProps) {
  const { error } = useForm();
  if (error) {
    return <FormMessage {...props} message={error} />;
  }
  return null;
}

export default CustomFormMessage;
