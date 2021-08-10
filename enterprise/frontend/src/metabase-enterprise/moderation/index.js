import { PLUGIN_MODERATION } from "metabase/plugins";
import QuestionModerationSection from "./components/QuestionModerationSection/QuestionModerationSection";
import ModerationStatusIcon from "./components/ModerationStatusIcon/ModerationStatusIcon";

import { getStatusIconForQuestion } from "./service";

Object.assign(PLUGIN_MODERATION, {
  QuestionModerationSection,
  ModerationStatusIcon,
  getStatusIconForQuestion,
});
