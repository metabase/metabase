import {
  type ModerationPlugin,
  PLUGIN_MODERATION_NOOP,
} from "metabase/moderation/types";
import { gatedPlugin } from "metabase/plugins/gated-plugin";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { Dashboard } from "metabase-types/api";

import { EntityModerationIcon } from "./components/EntityModerationIcon";
import { MetabotVerifiedContentConfigurationPane } from "./components/MetabotVerifiedContentConfigurationPane";
import {
  ModerationReviewTextForDashboard,
  ModerationReviewTextForQuestion,
} from "./components/ModerationReviewText";
import { ModerationStatusIcon } from "./components/ModerationStatusIcon";
import { useCardMenuItems, useDashboardMenuItems } from "./hooks/useMenuItems";
import {
  getModerationTimelineEvents,
  getQuestionIcon,
  getStatusIcon,
} from "./service";

const isEnabled = () => hasPremiumFeature("content_verification") ?? false;

const enterprisePlugin: ModerationPlugin = {
  isEnabled,
  EntityModerationIcon,
  ModerationReviewTextForQuestion,
  ModerationReviewTextForDashboard,
  ModerationStatusIcon,
  MetabotVerifiedContentConfigurationPane,
  getQuestionIcon,
  // Adapt the service's `{ name, color } | {}` to the contract's
  // `IconProps | string | undefined`.
  getStatusIcon: (status, filled) => {
    const icon = getStatusIcon(status, filled);
    return "name" in icon && icon.name
      ? { name: icon.name, color: icon.color }
      : undefined;
  },
  // Adapt the service's `timestamp: string | null` to the contract's `string`.
  getModerationTimelineEvents: (reviews, currentUser) =>
    getModerationTimelineEvents(reviews, currentUser ?? undefined).map(
      (event) => ({
        ...event,
        timestamp: event.timestamp ?? "",
        icon: event.icon ?? {},
      }),
    ),
  useCardMenuItems,
  // The contract allows an absent dashboard (the menu can mount before one
  // resolves); the underlying hook only runs meaningfully once it exists.
  useDashboardMenuItems: (dashboard, reload) =>
    useDashboardMenuItems(dashboard as Dashboard, reload),
  useQuestionMenuItems: () => [],
};

/**
 * The enterprise behaviour is active only while the content_verification token
 * feature is present; otherwise the plugin transparently falls back to the OSS
 * default. The build bundles this module; `gatedPlugin` decides activation at
 * runtime, so every member (components, hooks, functions) is gated in one place
 * and the implementation above stays a plain object.
 */
export const PLUGIN_MODERATION: ModerationPlugin = gatedPlugin(
  isEnabled,
  enterprisePlugin,
  PLUGIN_MODERATION_NOOP,
);
