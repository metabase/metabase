import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dashboard,
  IconName,
  MetabotInfo,
  ModerationReview,
  User,
} from "metabase-types/api";

export type RevisionOrModerationEvent = {
  title: string;
  timestamp: string;
  icon: IconName | { name: IconName; color: ColorName } | Record<string, never>;
  description?: string;
  revision?: any;
};

export interface EntityModerationIconProps {
  moderationReviews?: ModerationReview[];
}

export type ModerationStatusIconProps = {
  status: string | null | undefined;
  filled?: boolean;
} & Partial<IconProps>;

export interface ModerationReviewTextForQuestionProps {
  question: Question;
}

export interface ModerationReviewTextForDashboardProps {
  dashboard: Dashboard;
}

export interface MetabotVerifiedContentConfigurationPaneProps {
  metabot: MetabotInfo;
}

export interface QuestionIcon {
  icon: IconName;
  tooltip: string;
}

/**
 * The moderation plugin contract — the single source of truth for the
 * plugin's shape.
 *
 * Two modules implement it:
 *   - `metabase/moderation/plugin` (OSS default, all no-ops)
 *   - `metabase-enterprise/moderation/plugin` (enterprise implementation)
 *
 * The build resolves which one is bundled via an alias in
 * `frontend/build/shared/rspack/resolve-aliases.js`; the eslint boundary
 * resolver reads that same config, so lint and the bundle agree. Both impls
 * are type-checked against this interface in a single pass, so the blast
 * radius of a contract change is a real, statically traceable import edge.
 */
export interface ModerationPlugin {
  isEnabled: () => boolean;
  EntityModerationIcon: ComponentType<EntityModerationIconProps>;
  ModerationReviewTextForQuestion: ComponentType<ModerationReviewTextForQuestionProps>;
  ModerationReviewTextForDashboard: ComponentType<ModerationReviewTextForDashboardProps>;
  ModerationStatusIcon: ComponentType<ModerationStatusIconProps>;
  MetabotVerifiedContentConfigurationPane: ComponentType<MetabotVerifiedContentConfigurationPaneProps>;
  getStatusIcon: (
    status: string | null | undefined,
    filled?: boolean,
  ) => IconProps | string | undefined;
  getQuestionIcon: (card: Card) => QuestionIcon | null;
  getModerationTimelineEvents: (
    reviews: ModerationReview[],
    currentUser?: User | null,
  ) => RevisionOrModerationEvent[];
  useCardMenuItems: (card: Card, reload?: () => void) => ReactNode[];
  useDashboardMenuItems: (
    dashboard?: Dashboard,
    reload?: () => void,
  ) => ReactNode[];
  useQuestionMenuItems: (
    question: Question,
    reload?: () => void,
  ) => ReactNode[];
}
