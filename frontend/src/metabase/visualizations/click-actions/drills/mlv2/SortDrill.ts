import { t } from "ttag";
import type {
  ClickActionBase,
  Drill,
} from "metabase/visualizations/types/click-actions";
import type { SortDrillThruInfo } from "metabase-lib";

const ACTIONS: Record<string, ClickActionBase> = {
  asc: {
    name: "sort-ascending",
    icon: "arrow_up",
    section: "sort",
    buttonType: "sort",
    tooltip: t`Sort ascending`,
  },
  desc: {
    name: "sort-descending",
    icon: "arrow_down",
    section: "sort",
    buttonType: "sort",
    tooltip: t`Sort descending`,
  },
};

export const SortDrill: Drill<SortDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { directions } = drillDisplayInfo;

  return directions.map(sortDirection => ({
    ...ACTIONS[sortDirection],
    question: () => applyDrill(drill, sortDirection),
  }));
};
