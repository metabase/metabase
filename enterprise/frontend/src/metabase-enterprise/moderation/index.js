import { t } from "ttag";

import { useEditItemVerificationMutation } from "metabase/api";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  ModerationReviewBanner,
  ModerationReviewText,
} from "./components/ModerationReviewBanner";
import { ModerationStatusIcon } from "./components/ModerationStatusIcon";
import QuestionModerationButton from "./components/QuestionModerationButton";
import QuestionModerationIcon from "./components/QuestionModerationIcon";
import QuestionModerationSection from "./components/QuestionModerationSection";
import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getModerationTimelineEvents,
  getQuestionIcon,
  getStatusIcon,
  isItemVerified,
} from "./service";
import { getVerifyQuestionTitle } from "./utils";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_MODERATION, {
    isEnabled: () => true,
    QuestionModerationIcon,
    QuestionModerationSection,
    QuestionModerationButton,
    ModerationReviewBanner,
    ModerationReviewText,
    ModerationStatusIcon,
    getStatusIcon,
    getQuestionIcon,
    getModerationTimelineEvents,

    useMenuItems(model, isModerator, reload) {
      const [editItemVerification] = useEditItemVerificationMutation();
      const id = model.id();
      const { name: verifiedIconName } = getStatusIcon(
        MODERATION_STATUS.verified,
      );
      const latestModerationReview = getLatestModerationReview(
        model.getModerationReviews(),
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
                  moderated_item_id: id,
                  moderated_item_type: "card",
                  status: null,
                });
              } else {
                await editItemVerification({
                  moderated_item_id: id,
                  moderated_item_type: "card",
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
    },
  });
}
