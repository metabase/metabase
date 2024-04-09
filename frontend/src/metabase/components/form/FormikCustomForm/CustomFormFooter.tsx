import cx from "classnames";
import PropTypes from "prop-types";
import type * as React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

import CustomFormMessage from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";

export interface CustomFormFooterProps {
  submitTitle?: string;
  cancelTitle?: string;
  fullWidth?: boolean;
  isModal?: boolean;
  isContextModal?: boolean;
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
  isContextModal,
}: CustomFormFooterProps) {
  return (
    <div
      className={cx(CS.flex, CS.alignCenter, {
        [CS.flexReverse]: isModal || isContextModal,
      })}
    >
      <CustomFormSubmit fullWidth={fullWidth}>{submitTitle}</CustomFormSubmit>
      {onCancel && (
        <Button className={CS.mx1} type="button" onClick={onCancel}>
          {cancelTitle}
        </Button>
      )}
      <div className={CS.flexFull} />
      <CustomFormMessage className={CS.ml1} noPadding />
      {footerExtraButtons}
    </div>
  );
}
interface LegacyContextProps {
  isModal?: boolean;
}

// Modal components uses legacy React context to pass `isModal` prop
/**
 * @deprecated
 */
const CustomFormFooterLegacyContext = (
  props: CustomFormFooterProps,
  { isModal }: LegacyContextProps,
) => <CustomFormFooter {...props} isContextModal={isModal} />;

CustomFormFooterLegacyContext.contextTypes = {
  isModal: PropTypes.bool,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomFormFooterLegacyContext;
