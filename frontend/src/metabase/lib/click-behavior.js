import { msgid, ngettext, t } from "ttag";
import { getIn } from "icepick";
import Question from "metabase-lib/Question";

export function getClickBehaviorDescription(dashcard) {
  const noBehaviorMessage = hasActionsMenu(dashcard)
    ? t`Open the drill-through menu`
    : t`Do nothing`;
  if (isTableDisplay(dashcard)) {
    const count = Object.values(
      getIn(dashcard, ["visualization_settings", "column_settings"]) || {},
    ).filter(settings => settings.click_behavior != null).length;
    if (count === 0) {
      return noBehaviorMessage;
    }
    return ngettext(
      msgid`${count} column has custom behavior`,
      `${count} columns have custom behavior`,
      count,
    );
  }
  const { click_behavior: clickBehavior } = dashcard.visualization_settings;
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

export function hasActionsMenu(dashcard) {
  // This seems to work, but it isn't the right logic.
  // The right thing to do would be to check for any drills. However, we'd need a "clicked" object for that.
  return !new Question(dashcard.card).isNative();
}

export function isTableDisplay(dashcard) {
  return dashcard?.card?.display === "table";
}
