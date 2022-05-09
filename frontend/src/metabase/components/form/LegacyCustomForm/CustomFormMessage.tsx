import React from "react";
import _ from "underscore";

import FormMessage from "metabase/components/form/FormMessage";

import { CustomFormLegacyContext, LegacyContextTypes } from "./types";

export interface CustomFormMessageProps {
  className?: string;
  noPadding?: boolean;
}

function CustomFormMessage({
  error,
  ...props
}: CustomFormMessageProps & CustomFormLegacyContext) {
  if (error) {
    return <FormMessage {...props} message={error} formError />;
  }
  return null;
}

const CustomFormMessageLegacyContext = (
  props: CustomFormMessageProps,
  context: CustomFormLegacyContext,
) => <CustomFormMessage {...props} {...context} />;

CustomFormMessageLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "error",
);

export default CustomFormMessageLegacyContext;
