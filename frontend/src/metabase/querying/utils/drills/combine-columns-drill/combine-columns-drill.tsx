import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

import { CombineColumnsDrill } from "./components";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  query,
  stageIndex,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const DrillPopover = () => (
    <CombineColumnsDrill
      drill={drill}
      drillInfo={drillInfo}
      query={query}
      stageIndex={stageIndex}
      onSubmit={columnsAndSeparators => {
        applyDrill(drill, columnsAndSeparators);
      }}
    />
  );

  return [
    {
      name: "combine",
      title: t`Combine columns`,
      section: "combine",
      icon: "add",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
