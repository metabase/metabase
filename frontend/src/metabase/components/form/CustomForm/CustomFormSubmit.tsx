import React from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";

import { FormLegacyContext, LegacyContextTypes } from "./types";

export interface CustomFormSubmitProps {
  children: React.ReactNode;

  // ActionButton props
  fullWidth?: boolean;
}

function CustomFormSubmit({
  submitting,
  invalid,
  pristine,
  handleSubmit,
  submitTitle,
  renderSubmit,
  disablePristineSubmit,
  children,
  ...props
}: CustomFormSubmitProps & FormLegacyContext) {
  const title = children || submitTitle || t`Submit`;
  const canSubmit = !(
    submitting ||
    invalid ||
    (pristine && disablePristineSubmit)
  );

  if (renderSubmit) {
    return renderSubmit({ title, canSubmit, handleSubmit });
  }

  return (
    <ActionButton
      normalText={title}
      activeText={title}
      failedText={t`Failed`}
      successText={t`Success`}
      primary={canSubmit}
      disabled={!canSubmit}
      {...props}
      type="submit"
      actionFn={handleSubmit}
    />
  );
}

const CustomFormSubmitLegacyContext = (
  props: CustomFormSubmitProps,
  context: FormLegacyContext,
) => <CustomFormSubmit {...props} {...context} />;

CustomFormSubmitLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "values",
  "submitting",
  "invalid",
  "pristine",
  "handleSubmit",
  "submitTitle",
  "renderSubmit",
  "disablePristineSubmit",
);

export default CustomFormSubmitLegacyContext;
