import type { ModerationPlugin } from "./types";

const NoComponent = () => null;

/**
 * OSS default implementation of the moderation plugin — also the "disabled"
 * behaviour the enterprise plugin falls back to when the content_verification
 * feature is absent (see `gatedPlugin`). It lives in its own module (rather than
 * in `plugin.ts`) so the enterprise build can import it without the
 * `metabase/moderation/plugin` build-override pointing the import back at
 * itself. Consumers import the resolved entry, `metabase/moderation/plugin`.
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
