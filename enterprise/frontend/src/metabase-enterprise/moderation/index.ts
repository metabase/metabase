import { PLUGIN_MODERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EntityModerationIcon } from "./components/EntityModerationIcon";
import {
  ModerationReviewBanner,
  ModerationReviewTextForDashboard,
  ModerationReviewTextForQuestion,
} from "./components/ModerationReviewBanner";
import { ModerationStatusIcon } from "./components/ModerationStatusIcon";
import QuestionModerationSection from "./components/QuestionModerationSection";
import {
  useDashboardMenuItems,
  useQuestionMenuItems,
} from "./hooks/useMenuItems";
import {
  getModerationTimelineEvents,
  getQuestionIcon,
  getStatusIcon,
} from "./service";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_MODERATION, {
    isEnabled: () => true,
    EntityModerationIcon,
    QuestionModerationSection,
    ModerationReviewBanner,
    ModerationReviewTextForQuestion,
    ModerationReviewTextForDashboard,
    ModerationStatusIcon,
    getStatusIcon,
    getQuestionIcon,
    getModerationTimelineEvents,
    useQuestionMenuItems,
    useDashboardMenuItems,
  });
}
