import { t } from "ttag";
import type { ClickActionBase, Drill } from "metabase/visualizations/types";
import {
  sortDrill,
  sortDrillQuestion,
} from "metabase-lib/queries/drills/sort-drill";

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

const SortDrill: Drill = ({ question, clicked }) => {
  const drill = sortDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { sortDirections } = drill;
  return sortDirections.map(sortDirection => ({
    ...ACTIONS[sortDirection],
    question: () => sortDrillQuestion({ question, clicked, sortDirection }),
  }));
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SortDrill;
