import { assocIn } from "icepick";
import _ from "underscore";

import {
  COLUMN_SPLIT_SETTING,
  NATIVE_COLUMN_SPLIT_SETTING,
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

  const isNative = Lib.queryDisplayInfo(question.query()).isNative;

  if (wasPivot || isPivot) {
    const hasBreakouts =
      !isNative && Lib.breakouts(question.query(), -1).length > 0;

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
      isNative,
      rawSeries: rawSeries ?? undefined,
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
  isNative,
  rawSeries,
}: {
  isPivot: boolean;
  wasPivot: boolean;
  hasBreakouts: boolean;
  currentQuestion?: Question;
  question: Question;
  isNative: boolean;
  rawSeries?: Series;
}) {
  const isValidPivotTable = isPivot && (hasBreakouts || isNative);

  const displayChanged =
    (!wasPivot && isValidPivotTable) || (wasPivot && !isPivot);
  if (displayChanged) {
    return true;
  }

  const currentPivot = currentQuestion?.setting(COLUMN_SPLIT_SETTING);
  const nextPivot = question.setting(COLUMN_SPLIT_SETTING);

  const currentNativePivot = currentQuestion?.setting(
    NATIVE_COLUMN_SPLIT_SETTING,
  );
  const nextNativePivot = question.setting(NATIVE_COLUMN_SPLIT_SETTING);

  const pivotSettingsChanged =
    !_.isEqual(currentPivot, nextPivot) ||
    !_.isEqual(currentNativePivot, nextNativePivot);

  let currentShowRowTotals = false;
  let currentShowColumnTotals = false;

  const exportOptions = rawSeries?.[0]?.data?.["pivot-export-options"];
  if (exportOptions) {
    currentShowRowTotals = exportOptions["show-row-totals"] ?? false;
    currentShowColumnTotals = exportOptions["show-column-totals"] ?? false;
  }

  const nextShowRowTotals = question.setting("pivot.show_row_totals");
  const nextShowColumnTotals = question.setting("pivot.show_column_totals");

  const totalsOptionAdded =
    isValidPivotTable &&
    ((currentShowRowTotals === false && nextShowRowTotals === true) ||
      (currentShowColumnTotals === false && nextShowColumnTotals === true));

  return isValidPivotTable && (pivotSettingsChanged || totalsOptionAdded);
}
