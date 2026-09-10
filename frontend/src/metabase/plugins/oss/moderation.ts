import type React from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type Question from "metabase-lib/v1/Question";
import type {
  BaseUser,
  Card,
  Dashboard,
  IconName,
  MetabotInfo,
} from "metabase-types/api";

import { definePluginSlot } from "../slot";

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
  ModerationReviewTextForQuestion: PluginPlaceholder,
  ModerationReviewTextForDashboard: PluginPlaceholder,
  ModerationStatusIcon: PluginPlaceholder,
  getQuestionIcon: PluginPlaceholder,
  getStatusIcon: (_moderated_status?: string): string | IconProps | undefined =>
    undefined,
  getModerationTimelineEvents: (_reviews: any, _currentUser: BaseUser | null) =>
    // Unjustified type cast. FIXME
    [] as RevisionOrModerationEvent[],
  useDashboardMenuItems: (_model?: Dashboard, _reload?: () => void) => [],
  useQuestionMenuItems: (_model?: Question, _reload?: () => void) => [],
  useCardMenuItems: (_model?: Card, _reload?: () => void) => [],
  MetabotVerifiedContentConfigurationPane:
    // Unjustified type cast. FIXME
    PluginPlaceholder as React.ComponentType<{ metabot: MetabotInfo }>,
});

export const PLUGIN_MODERATION = definePluginSlot(getDefaultPluginModeration);
