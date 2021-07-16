import { PLUGIN_MODERATION } from "metabase/plugins";
import QuestionModerationSection from "./components/QuestionModerationSection/QuestionModerationSection";

import { getStatusIconForReviews } from "./service";

Object.assign(PLUGIN_MODERATION, {
  QuestionModerationSection,
  getStatusIconForReviews,
});
