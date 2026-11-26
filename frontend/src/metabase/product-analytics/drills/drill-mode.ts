import type {
  ClickAction,
  ClickActionsMode,
} from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

import type { Grain } from "../analyses/types";

import { getClickedDrill } from "./drill";
import { getSeeActorsTitle } from "./labels";

type DrillModeOptions = {
  counting: Grain;
  describeDrill: (drill: Lib.AnalysisDrill) => string | null;
  onDrill: (drill: Lib.AnalysisDrill) => void;
};

/**
 * The click actions on an analysis's chart. A cell the analysis can describe
 * offers to show its actors.
 */
export const getDrillMode = ({
  counting,
  describeDrill,
  onDrill,
}: DrillModeOptions): ClickActionsMode => ({
  actionsForClick: (clicked): ClickAction[] => {
    const drill = getClickedDrill(clicked);
    if (drill === null || describeDrill(drill) === null) {
      return [];
    }
    return [
      {
        name: "product-analytics.see-actors",
        type: "custom",
        section: "custom",
        buttonType: "horizontal",
        icon: "list",
        title: getSeeActorsTitle(counting),
        onClick: ({ closePopover }) => {
          closePopover();
          onDrill(drill);
        },
      },
    ];
  },
});
