import { assocIn } from "icepick";
import _ from "underscore";

import {
  PREAGG_COLUMN_SPLIT_SETTING,
  UNAGG_COLUMN_SPLIT_SETTING,
} from "metabase/lib/data_grid";
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
  const displayChange = (!wasPivot && isPivot) || (wasPivot && !isPivot);
  if (displayChange) {
    return true;
  }

  const currentSettings = question?.settings();
  const prevSettings = currentQuestion?.settings();

  const isUnaggregatedData = !hasBreakouts;

  if (isUnaggregatedData) {
    const currentPivotSettings = currentSettings[UNAGG_COLUMN_SPLIT_SETTING];
    const prevPivotSettings = prevSettings?.[UNAGG_COLUMN_SPLIT_SETTING];
    // TODO: we can add support for running pivot queries with any settings
    // once M1 of the simple pivots migration is merged
    const areCurrentSettingsValid =
      currentPivotSettings &&
      prevPivotSettings &&
      (currentPivotSettings.rows?.length > 0 ||
        currentPivotSettings.cols?.length > 0) &&
      currentPivotSettings.values?.length > 0;

    return (
      areCurrentSettingsValid &&
      !_.isEqual(currentPivotSettings, prevPivotSettings)
    );
  } else {
    const currentPivotSettings = currentSettings[PREAGG_COLUMN_SPLIT_SETTING];
    const prevPivotSettings = prevSettings?.[PREAGG_COLUMN_SPLIT_SETTING];

    return !_.isEqual(currentPivotSettings, prevPivotSettings);
  }
}
