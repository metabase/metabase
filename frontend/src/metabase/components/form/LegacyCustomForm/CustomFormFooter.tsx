import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import CustomFormMessage from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";

export interface CustomFormFooterProps {
  submitTitle: string;
  cancelTitle?: string;
  fullWidth?: boolean;
  isModal?: boolean;
  footerExtraButtons: React.ReactElement[];
  onCancel?: () => void;
}

interface LegacyContextProps {
  isModal?: boolean;
}

function CustomFormFooter({
  submitTitle,
  cancelTitle = t`Cancel`,
  onCancel,
  footerExtraButtons,
  fullWidth,
  isModal,
  isContextModal,
}: CustomFormFooterProps & { isContextModal?: boolean }) {
  return (
    <div
      className={cx("flex align-center", {
        "flex-reverse": isModal || isContextModal,
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

const CustomFormFooterLegacyContext = (
  props: CustomFormFooterProps,
  { isModal: isContextModal }: LegacyContextProps,
) => <CustomFormFooter {...props} isContextModal={isContextModal} />;

CustomFormFooterLegacyContext.contextTypes = {
  isModal: PropTypes.bool,
};

export default CustomFormFooterLegacyContext;
