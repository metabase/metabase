import React from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";

import { useForm } from "./context";

interface CustomFormSubmitProps {
  children: React.ReactNode;

  // ActionButton props
  fullWidth?: boolean;
}

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

export default CustomFormSubmit;
