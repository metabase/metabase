import { t } from "ttag";
import { useEditItemVerificationMutation } from "metabase/api";

import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "../service";
import { getVerifyQuestionTitle } from "../utils";
import Question from "metabase-lib/v1/Question";

import { Dashboard, entityIsDashboard } from "metabase-types/api";
import { useMemo } from "react";

export const useMenuItems = (
  model: Question | Dashboard,
  isModerator: boolean,
  reload: () => void,
) => {
  const [editItemVerification] = useEditItemVerificationMutation();

  const isDashboard = entityIsDashboard(model);

  const { moderated_item_id, moderated_item_type } = useMemo(() => {
    return {
      moderated_item_id: isDashboard ? (model.id as number) : model.id(),
      moderated_item_type: isDashboard
        ? ("dashboard" as const)
        : ("card" as const),
    };
  }, [isDashboard, model]);

  const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);
  const latestModerationReview = getLatestModerationReview(
    isDashboard ? model.moderation_reviews : model.getModerationReviews(),
  );
  const isVerified = isItemVerified(latestModerationReview);

  if (isModerator) {
    return [
      {
        title: isVerified
          ? t`Remove verification`
          : getVerifyQuestionTitle(model),
        icon: isVerified ? "close" : verifiedIconName,
        action: async () => {
          if (isVerified) {
            await editItemVerification({
              moderated_item_id,
              moderated_item_type,
              status: null,
            });
          } else {
            await editItemVerification({
              moderated_item_id,
              moderated_item_type,
              status: "verified",
            });
          }

          reload();
        },
        testId: isVerified
          ? "moderation-remove-verification-action"
          : "moderation-verify-action",
      },
    ];
  }

  return [];
};
