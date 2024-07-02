import { isNotNull } from "metabase/lib/types";
import type { ClickAction } from "metabase/visualizations/types";
import type { DrillThruDisplayInfo } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { DRILLS } from "./constants";

export function queryDrill(
  question: Question,
  clicked: Lib.ClickObject,
  isDrillEnabled: (drill: DrillThruDisplayInfo) => boolean,
): ClickAction[] {
  const query = question.query();
  const stageIndex = -1;
  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    clicked.column,
    clicked.value,
    clicked.data,
    clicked.dimensions,
  );

  const applyDrill = (drill: Lib.DrillThru, ...args: unknown[]) => {
    const newQuery = Lib.drillThru(query, stageIndex, drill, ...args);
    return question.setQuery(newQuery);
  };

  return drills
    .flatMap(drill => {
      const drillInfo = Lib.displayInfo(query, stageIndex, drill);
      const drillHandler = DRILLS[drillInfo.type];

      if (!isDrillEnabled(drillInfo) || !drillHandler) {
        return null;
      }

      return drillHandler({
        question,
        query,
        stageIndex,
        drill,
        drillInfo,
        clicked,
        applyDrill,
      });
    })
    .filter(isNotNull);
}
