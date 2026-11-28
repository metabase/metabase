import {
  type OmniPickerDashboardItem,
  type OmniPickerItem,
  isInCollectionTree,
} from "metabase/common/components/Pickers";
import type { CollectionItemModel, DashboardId } from "metabase-types/api";

const QUESTION_MODELS: ReadonlySet<CollectionItemModel> = new Set([
  "card",
  "dataset",
  "metric",
]);

function hasQuestionsInside({
  here = [],
  below = [],
}: Pick<OmniPickerDashboardItem, "here" | "below">): boolean {
  return [...here, ...below].some((model) => QUESTION_MODELS.has(model));
}

/**
 * Whether an item should be disabled in the question picker used to add or
 * replace a card on the given dashboard. Questions saved in another dashboard
 * can't be used. The only dashboard that can be opened is this one, and only
 * when it has questions saved in it.
 */
export function isQuestionPickerItemDisabled(
  item: OmniPickerItem,
  dashboardId: DashboardId,
): boolean {
  if (
    isInCollectionTree(item) &&
    item.dashboard_id &&
    item.dashboard_id !== dashboardId
  ) {
    return true;
  }

  if (item.model === "dashboard") {
    return item.id !== dashboardId || !hasQuestionsInside(item);
  }

  return false;
}
