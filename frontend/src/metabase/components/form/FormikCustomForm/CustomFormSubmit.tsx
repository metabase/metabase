import React from "react";
import { t } from "ttag";

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
    renderSubmit,
    disablePristineSubmit,
  } = useForm();

  const title = props.children || submitTitle || t`Submit`;
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomFormSubmit;
