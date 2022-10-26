import { t } from "ttag";
import {
  sortDrill,
  sortDrillQuestion,
} from "metabase-lib/queries/drills/sort-drill";

const ACTIONS = {
  asc: {
    name: "sort-ascending",
    section: "sort",
    buttonType: "sort",
    icon: "arrow_up",
    tooltip: t`Sort ascending`,
  },
  desc: {
    name: "sort-descending",
    section: "sort",
    buttonType: "sort",
    icon: "arrow_down",
    tooltip: t`Sort descending`,
  },
};

export default ({ question, clicked }) => {
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
