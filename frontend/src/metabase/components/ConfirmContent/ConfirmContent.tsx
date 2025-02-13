import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import CS from "metabase/css/core/index.css";
import { Button } from "metabase/ui";

interface ConfirmContentProps {
  "data-testid"?: string;
  title: string | ReactNode;
  content?: string | null;
  message?: string | ReactNode;
  onClose?: () => void;
  onAction?: () => void;
  onCancel?: () => void;
  confirmButtonText?: string;
  confirmButtonPrimary?: boolean;
  cancelButtonText?: string;
}

const ConfirmContent = ({
  "data-testid": dataTestId,
  title,
  content = null,
  message = t`Are you sure you want to do this?`,
  onClose = _.noop,
  onAction = _.noop,
  onCancel = _.noop,
  confirmButtonText = t`Yes`,
  confirmButtonPrimary = false,
  cancelButtonText = t`Cancel`,
}: ConfirmContentProps) => (
  <ModalContent
    data-testid={dataTestId}
    title={title}
    formModal
    onClose={() => {
      onCancel();
      onClose();
    }}
  >
    <div>{content}</div>

    <p className={cx(CS.mb4, CS.textDark)}>{message}</p>

    <div className={CS.mlAuto}>
      {cancelButtonText && (
        <Button
          onClick={() => {
            onCancel();
            onClose();
          }}
        >
          {cancelButtonText}
        </Button>
      )}
      <Button
        variant="filled"
        color={confirmButtonPrimary ? "primary" : "danger"}
        className={CS.ml2}
        onClick={() => {
          onAction();
          onClose();
        }}
      >
        {confirmButtonText}
      </Button>
    </div>
  </ModalContent>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ConfirmContent;
