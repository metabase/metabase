import React from "react";
import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import CustomFormMessage from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";

export interface CustomFormFooterProps {
  submitTitle?: string;
  cancelTitle?: string;
  fullWidth?: boolean;
  isModal?: boolean;
  footerExtraButtons?: React.ReactElement[];
  onCancel?: () => void;
}

function CustomFormFooter({
  submitTitle = t`Submit`,
  cancelTitle = t`Cancel`,
  onCancel,
  footerExtraButtons,
  fullWidth,
  isModal,
}: CustomFormFooterProps) {
  return (
    <div
      className={cx("flex align-center", {
        "flex-reverse": isModal,
      })}
    >
      <CustomFormSubmit fullWidth={fullWidth}>{submitTitle}</CustomFormSubmit>
      {onCancel && (
        <Button className="mx1" type="button" onClick={onCancel}>
          {cancelTitle}
        </Button>
      )}
      <div className="flex-full" />
      <CustomFormMessage className="ml1" noPadding />
      {footerExtraButtons}
    </div>
  );
}

export default CustomFormFooter;
