import React from "react";
import _ from "underscore";

import FormMessage from "metabase/components/form/FormMessage";

import { FormLegacyContext, LegacyContextTypes } from "./types";

export interface CustomFormMessageProps {
  className?: string;
  noPadding?: boolean;
}

function CustomFormMessage({
  error,
  ...props
}: CustomFormMessageProps & FormLegacyContext) {
  if (error) {
    return <FormMessage {...props} message={error} />;
  }
  return null;
}

const CustomFormMessageLegacyContext = (
  props: CustomFormMessageProps,
  context: FormLegacyContext,
) => <CustomFormMessage {...props} {...context} />;

CustomFormMessageLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "error",
);

export default CustomFormMessageLegacyContext;
