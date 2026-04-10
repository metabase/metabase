import { getIn } from "icepick";
import { msgid, ngettext, t } from "ttag";

import { Dashboards } from "metabase/entities/dashboards";
import { Questions } from "metabase/entities/questions";
import Question from "metabase-lib/v1/Question";
import type {
  ClickBehavior,
  ColumnSettings,
  DashboardCard,
  DatasetQuery,
} from "metabase-types/api";

type LinkTargetClickBehavior = {
  type: "link";
  linkType: "question" | "dashboard";
  targetId?: number;
};

type LinkedEntityQuery = {
  entity: typeof Questions | typeof Dashboards;
  entityType: "question" | "dashboard";
  entityId: number | undefined;
};

export function getClickBehaviorDescription(dashcard: DashboardCard): string {
  const noBehaviorMessage = hasActionsMenu(dashcard)
    ? t`Open the drill-through menu`
    : t`Do nothing`;
  if (isTableDisplay(dashcard)) {
    const count = Object.values(
      (getIn(dashcard, ["visualization_settings", "column_settings"]) as Record<
        string,
        ColumnSettings
      > | null) ?? {},
    ).filter((settings) => settings.click_behavior != null).length;
    if (count === 0) {
      return noBehaviorMessage;
    }
    return ngettext(
      msgid`${count} column has custom behavior`,
      `${count} columns have custom behavior`,
      count,
    );
  }
  const clickBehavior = (
    dashcard.visualization_settings as Record<string, unknown>
  )?.click_behavior as ClickBehavior | null | undefined;
  if (clickBehavior == null) {
    return noBehaviorMessage;
  }
  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;
    return linkType == null
      ? t`Go to...`
      : linkType === "dashboard"
        ? t`Go to dashboard`
        : linkType === "question"
          ? t`Go to question`
          : t`Go to url`;
  }

  return t`Filter this dashboard`;
}

export function hasActionsMenu(dashcard: DashboardCard): boolean {
  const datasetQuery = dashcard.card.dataset_query;
  if (!datasetQuery) {
    return false;
  }
  // This seems to work, but it isn't the right logic.
  // The right thing to do would be to check for any drills. However, we'd need a "clicked" object for that.
  const question = Question.create({
    // dataset_query can be Record<string, never> for virtual cards; treat as DatasetQuery
    dataset_query: datasetQuery as DatasetQuery,
  });
  return !question.isNative();
}

export function isTableDisplay(dashcard: DashboardCard): boolean {
  return dashcard?.card?.display === "table";
}

export function getLinkTargets(
  settings: Record<string, unknown> | null | undefined,
): LinkedEntityQuery[] {
  const { click_behavior, column_settings = {} } = (settings ?? {}) as {
    click_behavior?: ClickBehavior;
    column_settings?: Record<string, ColumnSettings>;
  };
  return [
    click_behavior,
    ...Object.values(column_settings).map(
      (colSettings) => colSettings.click_behavior,
    ),
  ]
    .filter(hasLinkedQuestionOrDashboard)
    .map(mapLinkedEntityToEntityQuery);
}

function hasLinkedQuestionOrDashboard(
  behavior: ClickBehavior | null | undefined,
): behavior is LinkTargetClickBehavior {
  if (behavior?.type === "link") {
    const { linkType } = behavior as { type: "link"; linkType?: string };
    return linkType === "question" || linkType === "dashboard";
  }
  return false;
}

function mapLinkedEntityToEntityQuery(
  behavior: LinkTargetClickBehavior,
): LinkedEntityQuery {
  return {
    entity: behavior.linkType === "question" ? Questions : Dashboards,
    entityType: behavior.linkType,
    entityId: behavior.targetId,
  };
}
