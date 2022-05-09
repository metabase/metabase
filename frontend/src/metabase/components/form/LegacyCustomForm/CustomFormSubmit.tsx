import React from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";

import { CustomFormLegacyContext, LegacyContextTypes } from "./types";

interface CustomFormSubmitProps {
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
}: CustomFormSubmitProps & CustomFormLegacyContext) {
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
  context: CustomFormLegacyContext,
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
