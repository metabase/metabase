import React from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";

import { useForm } from "./context";

export interface CustomFormSubmitProps {
  children: React.ReactNode;

  // ActionButton props
  fullWidth?: boolean;
}

/**
 * @deprecated
 */
function CustomFormSubmit(props: CustomFormSubmitProps) {
  const {
    submitting,
    invalid,
    pristine,
    handleSubmit,
    submitTitle,
    submitButtonColor,
    renderSubmit,
    disablePristineSubmit,
  } = useForm();

  const title = props.children || submitTitle || t`Submit`;
  const canSubmit = !(
    submitting ||
    invalid ||
    (pristine && disablePristineSubmit)
  );

  // allow us to change the color of the submit button
  const submitButtonVariant = { [submitButtonColor ?? "primary"]: canSubmit };

  if (renderSubmit) {
    return renderSubmit({ title, canSubmit, handleSubmit });
  }

  return (
    <ActionButton
      normalText={title}
      activeText={title}
      failedText={t`Failed`}
      successText={t`Success`}
      {...submitButtonVariant}
      primary={canSubmit}
      disabled={!canSubmit}
      {...props}
      type="submit"
      actionFn={handleSubmit}
    />
  );
}

export default CustomFormSubmit;
