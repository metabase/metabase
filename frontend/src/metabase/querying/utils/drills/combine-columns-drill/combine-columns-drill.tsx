import { t } from "ttag";

import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

import { CombineColumnsDrill } from "./components";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  question,
  query: originalQuery,
  stageIndex: originalStageIndex,
  drill,
  clicked,
}) => {
  if (!clicked.column) {
    return [];
  }

  const column = Lib.fromLegacyColumn(
    originalQuery,
    originalStageIndex,
    clicked.column,
  );
  const { query, stageIndex } = Lib.asReturned(
    originalQuery,
    originalStageIndex,
  );

  const DrillPopover = () => (
    <CombineColumnsDrill
      column={column}
      drill={drill}
      query={query}
      stageIndex={stageIndex}
      onSubmit={newQuery => {
        question.setQuery(newQuery);
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
