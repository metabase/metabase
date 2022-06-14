import { PLUGIN_MODERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import QuestionModerationSection from "./components/QuestionModerationSection/QuestionModerationSection";
import QuestionModerationButton from "./components/QuestionModerationButton/QuestionModerationButton";
import ModerationReviewBanner from "./components/ModerationReviewBanner/ModerationReviewBanner";
import ModerationStatusIcon from "./components/ModerationStatusIcon/ModerationStatusIcon";

import {
  getStatusIconForQuestion,
  getStatusIcon,
  getModerationTimelineEvents,
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
  });
}
