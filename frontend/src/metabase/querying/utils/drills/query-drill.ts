import type { ClickAction } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { DRILLS } from "./constants";

export function queryDrill(
  question: Question,
  clicked?: Lib.ClickObject,
): ClickAction[] {
  const query = question._getMLv2Query();
  const stageIndex = -1;
  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    clicked?.column,
    clicked?.value,
    clicked?.data,
    clicked?.dimensions,
  );

  const applyDrill = (drill: Lib.DrillThru, ...args: unknown[]) => {
    const newQuery = Lib.drillThru(query, stageIndex, drill, ...args);
    return question._setMLv2Query(newQuery);
  };

  return drills.flatMap(drill => {
    const drillInfo = Lib.displayInfo(query, stageIndex, drill);
    const drillHandler = DRILLS[drillInfo.type];
    return drillHandler({
      question,
      query,
      stageIndex,
      drill,
      drillInfo,
      isDashboard: clicked?.extraData?.dashboard != null,
      applyDrill,
    });
  });
}
