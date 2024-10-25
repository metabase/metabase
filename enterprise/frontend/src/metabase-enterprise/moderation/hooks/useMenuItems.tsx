import { t } from "ttag";

import { useEditItemVerificationMutation } from "metabase/api";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, ModerationReview } from "metabase-types/api";

import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "../service";
import { getVerifyQuestionTitle } from "../utils";

export const useQuestionMenuItems = (
  question: Question,
  isModerator: boolean,
  reload: () => void,
) => {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const items = useMenuItems({
    isModerator,
    reload,
    moderated_item_id: question.id(),
    moderated_item_type: "card",
    latestModerationReview,
    title: getVerifyQuestionTitle(question),
  });

  return items;
};

export const useDashboardMenuItems = (
  dashboard: Dashboard,
  isModerator: boolean,
  reload: () => void,
) => {
  const latestModerationReview = getLatestModerationReview(
    dashboard.moderation_reviews || [],
  );

  const items = useMenuItems({
    isModerator,
    reload,
    moderated_item_id: dashboard.id as number,
    moderated_item_type: "dashboard",
    latestModerationReview,
    title: t`Verify this dashboard`,
  });

  return items;
};

const useMenuItems = ({
  isModerator,
  reload,
  moderated_item_id,
  moderated_item_type,
  title,
  latestModerationReview,
}: {
  isModerator: boolean;
  reload: () => void;
  moderated_item_id: number;
  moderated_item_type: "card" | "dashboard";
  title: string;
  latestModerationReview?: ModerationReview;
}) => {
  const [editItemVerification] = useEditItemVerificationMutation();

  const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

  const isVerified = isItemVerified(latestModerationReview);

  if (isModerator) {
    return [
      {
        title: isVerified ? t`Remove verification` : title,
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
