import { useEffect } from "react";
import { t } from "ttag";

import { SdkActionIcon } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/SdkActionIcon/SdkActionIcon";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { useQuestionAlertModalContext } from "embedding-sdk-bundle/components/private/notifications/context/QuestionAlertModalProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import { useHasEmailSetup } from "metabase/common/hooks";
import type { QuestionAlertsButtonProps } from "metabase/plugins";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { isInstanceAnalyticsCollection } from "metabase-enterprise/collections/utils";

/**
 * @internal Do not import this component directly, use either SDK or EAJS EE plugins instead.
 */
export const QuestionAlertsButton = (props: QuestionAlertsButtonProps) => {
  const { withAlerts, question } = useSdkQuestionContext();
  const canManageSubscriptions = useSdkSelector(canManageSubscriptionsSelector);
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);
  const { toggle: toggleModal, close: closeModal } =
    useQuestionAlertModalContext();

  const isSaved = question?.isSaved();
  const isModel = question?.type() === "model";
  const isAnalytics = isInstanceAnalyticsCollection(question?.collection());

  // Skip the pulse/form_input request in guest embed mode (EMB-1525),
  // as the endpoint does not exist for guest embeds.
  const hasEmailSetup = useHasEmailSetup({ skip: isGuestEmbed });

  const shouldRenderAlertsButton =
    hasEmailSetup &&
    !isGuestEmbed &&
    withAlerts &&
    isSaved &&
    canManageSubscriptions &&
    !isModel &&
    !isAnalytics;

  useEffect(() => {
    if (!shouldRenderAlertsButton) {
      closeModal();
    }

    return closeModal;
  }, [closeModal, shouldRenderAlertsButton]);
  /**
   * Use the same logic as in the core app. But we don't need `isAdmin` because it's already included in `canManageSubscriptions`.
   * @see {@link https://github.com/metabase/metabase/blob/363baef1d937078ecc1efe9710cbe883f830c819/frontend/src/metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionMoreActionsMenu/QuestionMoreActionsMenu.tsx#L131}
   */
  if (shouldRenderAlertsButton) {
    return (
      <SdkActionIcon
        tooltip={t`Alerts`}
        icon="alert"
        onClick={toggleModal}
        {...props}
      />
    );
  }

  return null;
};
