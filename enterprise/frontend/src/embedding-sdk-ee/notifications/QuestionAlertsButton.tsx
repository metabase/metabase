import { t } from "ttag";

import { ToolbarButton } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/ToolbarButton";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import type { QuestionAlertsButtonProps } from "embedding-sdk-bundle/components/public/notifications";
import { Tooltip } from "metabase/ui";

/**
 * @internal Do not import this component directly, use either SDK or EAJS EE plugins instead.
 */
export const QuestionAlertsButton = (props: QuestionAlertsButtonProps) => {
  const { withAlerts } = useSdkQuestionContext();
  if (!withAlerts) {
    return null;
  }
  //  XXX: Checks for `withAlerts` and decide to show/hide the component
  // We need this because users can render the component directly on the SDK e.g. <StaticQuestion.AlertsButton />

  // XXX: Open the alerts modal
  const handleClick = () => {};

  // XXX: Use the actual logic to hide/show the alerts button here

  return (
    <Tooltip label={t`Alerts`}>
      <ToolbarButton
        icon="alert"
        variant="default"
        px="sm"
        onClick={handleClick}
        {...props}
      />
    </Tooltip>
  );
};
