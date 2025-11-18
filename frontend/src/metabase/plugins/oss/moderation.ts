import type { ColorName } from "metabase/lib/colors/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconName, IconProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { BaseUser, Dashboard } from "metabase-types/api";

export type RevisionOrModerationEvent = {
  title: string;
  timestamp: string;
  icon: IconName | { name: IconName; color: ColorName } | Record<string, never>;
  description?: string;
  revision?: any;
};

const getDefaultPluginModeration = () => ({
  isEnabled: () => false,
  EntityModerationIcon: PluginPlaceholder,
  QuestionModerationSection: PluginPlaceholder,
  ModerationReviewBanner: PluginPlaceholder,
  ModerationReviewTextForQuestion: PluginPlaceholder,
  ModerationReviewTextForDashboard: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getQuestionIcon: PluginPlaceholder,
  getStatusIcon: (_moderated_status?: string): string | IconProps | undefined =>
    undefined,
  getModerationTimelineEvents: (_reviews: any, _currentUser: BaseUser | null) =>
    [] as RevisionOrModerationEvent[],
  useDashboardMenuItems: (_model?: Dashboard, _reload?: () => void) => [],
  useQuestionMenuItems: (_model?: Question, _reload?: () => void) => [],
});

export const PLUGIN_MODERATION = getDefaultPluginModeration();

export function reinitialize() {
  Object.assign(PLUGIN_MODERATION, getDefaultPluginModeration());
}
