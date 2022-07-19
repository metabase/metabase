import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import CustomFormMessage from "../CustomFormMessage";
import CustomFormSubmit from "../CustomFormSubmit";
import { CustomFormFooterStyled } from "./CustomFormFooter.styled";

import { CustomFormFooterProps } from "./CustomFormFooterTypes";

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
    <CustomFormFooterStyled shouldReverse={isModal || isContextModal}>
      <CustomFormSubmit fullWidth={fullWidth}>{submitTitle}</CustomFormSubmit>
      {onCancel && (
        <Button className="mx1" type="button" onClick={onCancel}>
          {cancelTitle}
        </Button>
      )}
      <CustomFormMessage className="mt1" />
      {footerExtraButtons}
    </CustomFormFooterStyled>
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
