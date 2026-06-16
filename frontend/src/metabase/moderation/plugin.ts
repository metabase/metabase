import type { ModerationPlugin } from "./types";

const NoComponent = () => null;

/**
 * OSS default implementation of the moderation plugin.
 *
 * In enterprise builds this whole module is swapped for
 * `metabase-enterprise/moderation/plugin` (see resolve-aliases.js), so this
 * file is never bundled there. Consumers import the resolved module directly:
 *
 *   import { PLUGIN_MODERATION } from "metabase/moderation/plugin";
 */
export const PLUGIN_MODERATION: ModerationPlugin = {
  isEnabled: () => false,
  EntityModerationIcon: NoComponent,
  ModerationReviewTextForQuestion: NoComponent,
  ModerationReviewTextForDashboard: NoComponent,
  ModerationStatusIcon: NoComponent,
  MetabotVerifiedContentConfigurationPane: NoComponent,
  getStatusIcon: () => undefined,
  getQuestionIcon: () => null,
  getModerationTimelineEvents: () => [],
  useCardMenuItems: () => [],
  useDashboardMenuItems: () => [],
  useQuestionMenuItems: () => [],
};
