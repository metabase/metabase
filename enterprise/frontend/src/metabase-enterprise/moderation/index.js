import { PLUGIN_MODERATION } from "metabase/plugins";
import ModerationActions from "./components/ModerationActions/ModerationActions";
import ModerationReviewBanner from "./components/ModerationReviewBanner/ModerationReviewBanner";
import { verifyItem, getVerifiedIcon, getIconForReview } from "./service";

Object.assign(PLUGIN_MODERATION, {
  ModerationActions,
  ModerationReviewBanner,
  verifyItem,
  getVerifiedIcon,
  getIconForReview,
});
