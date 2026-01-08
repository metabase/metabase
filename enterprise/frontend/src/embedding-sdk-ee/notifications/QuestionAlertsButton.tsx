import { useEffect } from "react";
import { t } from "ttag";

import { SdkActionIcon } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/SdkActionIcon/SdkActionIcon";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { useQuestionAlertModalContext } from "embedding-sdk-bundle/components/private/notifications/context/QuestionAlertModalProvider";
import type { QuestionAlertsButtonProps } from "embedding-sdk-bundle/components/public/notifications";

/**
 * @internal Do not import this component directly, use either SDK or EAJS EE plugins instead.
 */
export const QuestionAlertsButton = (props: QuestionAlertsButtonProps) => {
  const { withAlerts } = useSdkQuestionContext();
  const { toggle: toggleModal, close: closeModal } =
    useQuestionAlertModalContext();
  useEffect(() => {
    return closeModal;
  }, [closeModal]);
  if (!withAlerts) {
    return null;
  }

  // XXX: Use the actual logic to hide/show the alerts button here

  return (
    <SdkActionIcon
      tooltip={t`Alerts`}
      icon="alert"
      onClick={toggleModal}
      {...props}
    />
  );
};
