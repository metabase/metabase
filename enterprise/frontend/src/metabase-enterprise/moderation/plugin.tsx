import type { ComponentType } from "react";

import type { ModerationPlugin } from "metabase/moderation/types";
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

/**
 * The build guarantees this module is only bundled in EE builds, but the token
 * feature is only known at runtime — so each member is gated lazily here rather
 * than swapping the whole object once at boot. This is the "build decides code
 * presence; runtime decides activation" split.
 */
const gatedComponent = <Props extends object>(
  Component: ComponentType<Props>,
): ComponentType<Props> => {
  const Gated = (props: Props) =>
    isEnabled() ? <Component {...props} /> : null;
  Gated.displayName = `Gated(${Component.displayName ?? "Moderation"})`;
  return Gated;
};

export const PLUGIN_MODERATION: ModerationPlugin = {
  isEnabled,
  EntityModerationIcon: gatedComponent(EntityModerationIcon),
  ModerationReviewTextForQuestion: gatedComponent(
    ModerationReviewTextForQuestion,
  ),
  ModerationReviewTextForDashboard: gatedComponent(
    ModerationReviewTextForDashboard,
  ),
  ModerationStatusIcon: gatedComponent(ModerationStatusIcon),
  MetabotVerifiedContentConfigurationPane: gatedComponent(
    MetabotVerifiedContentConfigurationPane,
  ),
  // Adapt the service's `{ name, color } | {}` to the contract's
  // `IconProps | string | undefined`.
  getStatusIcon: (status, filled) => {
    if (!isEnabled()) {
      return undefined;
    }
    const icon = getStatusIcon(status, filled);
    return "name" in icon && icon.name
      ? { name: icon.name, color: icon.color }
      : undefined;
  },
  getQuestionIcon: (card) => (isEnabled() ? getQuestionIcon(card) : null),
  // Adapt the service's `timestamp: string | null` to the contract's `string`.
  getModerationTimelineEvents: (reviews, currentUser) =>
    isEnabled()
      ? getModerationTimelineEvents(reviews, currentUser ?? undefined).map(
          (event) => ({
            ...event,
            timestamp: event.timestamp ?? "",
            icon: event.icon ?? {},
          }),
        )
      : [],
  // Hooks must be called unconditionally; `isEnabled()` is stable for the
  // session, but gate the result rather than the call to satisfy rules-of-hooks.
  useCardMenuItems: (card, reload) => {
    const items = useCardMenuItems(card, reload);
    return isEnabled() ? items : [];
  },
  useDashboardMenuItems: (dashboard, reload) => {
    // The contract allows an absent dashboard (the menu can mount before one
    // resolves); the underlying hook only runs meaningfully once it exists.
    const items = useDashboardMenuItems(dashboard as Dashboard, reload);
    return isEnabled() ? items : [];
  },
  useQuestionMenuItems: () => [],
};
