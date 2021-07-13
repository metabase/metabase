import { PLUGIN_MODERATION } from "metabase/plugins";
import ModerationActions from "./components/ModerationActions/ModerationActions";
import { verifyItem, getVerifiedIcon, getIconForReview } from "./service";

Object.assign(PLUGIN_MODERATION, {
  ModerationActions,
  verifyItem,
  getVerifiedIcon,
  getIconForReview,
});
