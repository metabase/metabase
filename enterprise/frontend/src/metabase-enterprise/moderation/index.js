import { PLUGIN_MODERATION } from "metabase/plugins";
import QuestionModerationSection from "./components/QuestionModerationSection/QuestionModerationSection";

import {
  getVerifiedIcon,
  getIconForReview,
  getLatestModerationReview,
} from "./service";

Object.assign(PLUGIN_MODERATION, {
  QuestionModerationSection,

  getVerifiedIcon,
  getIconForReview,
  getLatestModerationReview,
});
