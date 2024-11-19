import { assocIn } from "icepick";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";

import { getQuestionWithDefaultVisualizationSettings } from "./utils";

interface Options {
  question: Question;
  currentQuestion?: Question;
  rawSeries?: Series;
}

export function computeQuestionPivotTable(options: Options) {
  const { currentQuestion, rawSeries } = options;

  let { question } = options;

  const isPivot = question.display() === "pivot";
  const wasPivot = currentQuestion?.display() === "pivot";
  let shouldRun = null;

  const isQuestionNative = Lib.queryDisplayInfo(question.query()).isNative;

  if (wasPivot || isPivot) {
    const hasBreakouts =
      !isQuestionNative && Lib.breakouts(question.query(), -1).length > 0;

    // compute the pivot setting now so we can query the appropriate data
    if (isPivot && hasBreakouts) {
      const key = "pivot_table.column_split";

      if (rawSeries) {
        const series = assocIn(rawSeries, [0, "card"], question.card());
        const setting = getQuestionWithDefaultVisualizationSettings(
          question,
          series,
        ).setting(key);

        question = question.updateSettings({ [key]: setting });
      }
    }

    shouldRun = checkShouldRerunPivotTableQuestion({
      isPivot,
      wasPivot,
      hasBreakouts,
      currentQuestion,
      question,
    });
  }

  return { shouldRun, question };
}

function checkShouldRerunPivotTableQuestion({
  isPivot,
  wasPivot,
  hasBreakouts,
  currentQuestion,
  question,
}: {
  isPivot: boolean;
  wasPivot: boolean;
  hasBreakouts: boolean;
  currentQuestion?: Question;
  question: Question;
}) {
  const isValidPivotTable = isPivot && hasBreakouts;
  const displayChange =
    (!wasPivot && isValidPivotTable) || (wasPivot && !isPivot);

  if (displayChange) {
    return true;
  }

  const currentPivotSettings = currentQuestion?.setting(
    "pivot_table.column_split",
  );

  const newPivotSettings = question.setting("pivot_table.column_split");

  return (
    isValidPivotTable && !_.isEqual(currentPivotSettings, newPivotSettings)
  );
}
