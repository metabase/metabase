import { t } from "ttag";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import QuestionModerationSection from "./components/QuestionModerationSection/QuestionModerationSection";
import QuestionModerationButton from "./components/QuestionModerationButton/QuestionModerationButton";
import ModerationReviewBanner from "./components/ModerationReviewBanner/ModerationReviewBanner";
import ModerationStatusIcon from "./components/ModerationStatusIcon/ModerationStatusIcon";

import {
  MODERATION_STATUS,
  getStatusIconForQuestion,
  getStatusIcon,
  getModerationTimelineEvents,
  verifyItem,
  removeReview,
  isItemVerified,
  getLatestModerationReview,
} from "./service";

if (hasPremiumFeature("content_management")) {
  Object.assign(PLUGIN_MODERATION, {
    isEnabled: () => true,
    QuestionModerationSection,
    QuestionModerationButton,
    ModerationReviewBanner,
    ModerationStatusIcon,
    getStatusIconForQuestion,
    getStatusIcon,
    getModerationTimelineEvents,
    getMenuItems: (model, isModerator, reload) => {
      const id = model.id();
      const isDataset = model.isDataset();
      const { name: verifiedIconName } = getStatusIcon(
        MODERATION_STATUS.verified,
      );
      const latestModerationReview = getLatestModerationReview(
        model.getModerationReviews(),
      );
      const isVerified = isItemVerified(latestModerationReview);

      if (isModerator) {
        return {
          title: isVerified
            ? t`Remove Verification`
            : isDataset
            ? t`Verify model`
            : t`Verify question`,
          icon: isVerified ? "close" : verifiedIconName,
          action: () => {
            if (isVerified) {
              removeReview({ itemId: id, itemType: "card" });
            } else {
              verifyItem({ itemId: id, itemType: "card" });
            }
            reload();
          },
        };
      }
    },
  });
}
