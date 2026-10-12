import { useCallback } from "react";
import { t } from "ttag";

import {
  type NumberFormatter,
  useNumberFormatter,
} from "metabase/common/hooks/use-number-formatter";
import { formatRowCount } from "metabase/common/utils/format-row-count";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { getTokenFeature } from "metabase/settings";
import { multiLevelPivot } from "metabase/visualizations/lib/data_grid";
import { hasNoResults } from "metabase/visualizations/lib/no-results";
import {
  MAX_COPY_CELLS,
  ResultsTooLargeError,
  flattenPivotGroupedData,
  getResultsClipboardContent,
} from "metabase/visualizations/lib/results-clipboard";
import { getChartImageBlob } from "metabase/visualizations/lib/save-chart-image";
import {
  getClassicPivotColumnIndexes,
  getVisibleTableData,
} from "metabase/visualizations/lib/visible-table-data";
import {
  type ComputedVisualizationSettings,
  canSavePng,
  extractRemappedColumns,
  getChartSelector,
  getComputedSettingsForSeries,
  isPivoted,
} from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type {
  Card,
  Dataset,
  DatasetData,
  RawSeries,
  RowValues,
} from "metabase-types/api";

type CopyMode = "results" | "chart";

const isGridDisplay = (question: Question) =>
  question.display() === "table" || question.display() === "pivot";

export const getCopyMode = (question: Question): CopyMode =>
  isGridDisplay(question) || !canSavePng(question.display())
    ? "results"
    : "chart";

const canWriteRichClipboard = () =>
  typeof ClipboardItem !== "undefined" &&
  typeof navigator.clipboard?.write === "function";

const canWriteTextClipboard = () =>
  typeof navigator.clipboard?.writeText === "function";

const getTooLargeReason = () => t`These results are too large to copy`;

const countDistinctValues = (rows: RowValues[], columnIndex: number) =>
  new Set(rows.map((row) => row[columnIndex])).size;

// multiLevelPivot returns the grid's dimensions plus a getRowSection accessor,
// so its size can be measured without fetching any cells
const getPivotGridSizeReason = (
  card: Card,
  data: DatasetData,
): string | null => {
  const series: RawSeries = [{ card, data: extractRemappedColumns(data) }];
  const settings = getComputedSettingsForSeries(series);
  const pivotData = multiLevelPivot(series[0].data, settings);
  if (!pivotData) {
    return null;
  }
  const cellCount =
    pivotData.rowCount * pivotData.columnCount * pivotData.valueIndexes.length;
  return cellCount > MAX_COPY_CELLS ? getTooLargeReason() : null;
};

const getClassicPivotSizeReason = (
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): string | null => {
  const { pivotIndex, normalIndex } = getClassicPivotColumnIndexes(
    data,
    settings,
  );
  if (pivotIndex < 0 || normalIndex < 0) {
    return null;
  }
  const cellCount =
    countDistinctValues(data.rows, normalIndex) *
    (countDistinctValues(data.rows, pivotIndex) + 1);
  return cellCount > MAX_COPY_CELLS ? getTooLargeReason() : null;
};

export const getCopyIneligibleReason = (
  question: Question,
  result: Dataset,
  isPivotResult: boolean,
  pivotedCopyEnabled: boolean,
): string | null => {
  // hasNoResults spots a pivot by column name alone, so an ordinary table with
  // a real column named pivot-grouping would read as an empty pivot
  const noResults = isPivotResult
    ? hasNoResults(result.data)
    : datasetContainsNoResults(result.data);
  if (noResults) {
    return t`There are no results to copy`;
  }

  if (getCopyMode(question) === "chart") {
    return canWriteRichClipboard()
      ? null
      : t`Copying isn't supported in this browser`;
  }

  if (!canWriteRichClipboard() && !canWriteTextClipboard()) {
    return t`Copying isn't supported in this browser`;
  }

  // The pivot renderer rejects a truncated result whatever the pivoted-export
  // format setting says, so nothing coherent is on screen to copy
  if (
    question.display() === "pivot" &&
    result.data.pivot_rows_truncated != null
  ) {
    return t`This pivot table is truncated and can't be copied`;
  }

  // The pivot grid comes from multiLevelPivot, not table.columns, so the
  // hidden-columns check below doesn't apply to it
  if (question.display() === "pivot" && pivotedCopyEnabled) {
    return getPivotGridSizeReason(question.card(), result.data);
  }

  // Anything but a table display (a chart, or a pivot copied flat because pivoted
  // copy is off) has no table.columns settings, so it copies through a table card
  const card =
    question.display() === "table"
      ? question.card()
      : question.setDisplay("table").card();
  const series: RawSeries = [
    { card, data: extractRemappedColumns(result.data) },
  ];
  const settings = getComputedSettingsForSeries(series);

  if (isPivoted(series, settings)) {
    return getClassicPivotSizeReason(result.data, settings);
  }

  const flatSeries: RawSeries = [
    {
      card,
      data: isPivotResult
        ? flattenPivotGroupedData(series[0].data)
        : series[0].data,
    },
  ];
  const { cols } = getVisibleTableData({
    series: flatSeries,
    settings,
    isShowingDetailsOnlyColumns: question.display() === "object",
    isShowingDisabledColumns: false,
  });

  if (cols.length === 0) {
    return t`All columns are hidden, so there's nothing to copy`;
  }
  return result.data.rows.length * cols.length > MAX_COPY_CELLS
    ? getTooLargeReason()
    : null;
};

interface UseCopyResultsParams {
  question: Question;
  result: Dataset;
  isPivotResult: boolean;
  pivotedCopyEnabled: boolean;
}

export const useCopyResults = ({
  question,
  result,
  isPivotResult,
  pivotedCopyEnabled,
}: UseCopyResultsParams) => {
  const dispatch = useDispatch();
  const translate = useTranslateContent();
  const formatNumber = useNumberFormatter();
  const isWhitelabeled = useSelector((state) =>
    getTokenFeature(state, "whitelabel"),
  );

  return useCallback(async (): Promise<void> => {
    try {
      if (getCopyMode(question) === "chart") {
        await copyChartImage(question, !isWhitelabeled);
        dispatch(addUndo({ message: t`Chart copied to clipboard` }));
        return;
      }

      const copiesPivotGrid =
        question.display() === "pivot" && pivotedCopyEnabled;
      const card =
        question.display() === "table" || copiesPivotGrid
          ? question.card()
          : question.setDisplay("table").card();

      const { text, html, rowCount, isPivotGrid } = getResultsClipboardContent({
        card,
        data: result.data,
        pivoted: copiesPivotGrid,
        isPivotResult,
        isShowingDetailsOnlyColumns: question.display() === "object",
        translate,
      });
      await writeResultsToClipboard(text, html);

      const message = getRowsCopiedMessage({
        rowCount,
        truncatedRowCount:
          result.data.rows_truncated || result.data.pivot_rows_truncated,
        isPivotGrid,
        formatNumber,
      });
      dispatch(addUndo({ message }));
    } catch (error) {
      dispatch(
        addUndo({
          icon: "warning",
          message:
            error instanceof ResultsTooLargeError
              ? getTooLargeReason()
              : t`Couldn't copy to clipboard`,
        }),
      );
    }
  }, [
    dispatch,
    question,
    result,
    translate,
    isWhitelabeled,
    isPivotResult,
    pivotedCopyEnabled,
    formatNumber,
  ]);
};

function getRowsCopiedMessage({
  rowCount,
  truncatedRowCount,
  isPivotGrid,
  formatNumber,
}: {
  rowCount: number;
  truncatedRowCount: number | undefined;
  isPivotGrid: boolean;
  formatNumber: NumberFormatter;
}): string {
  if (!truncatedRowCount) {
    return t`${formatRowCount(rowCount, formatNumber)} copied to clipboard`;
  }
  if (isPivotGrid) {
    const rows = formatRowCount(truncatedRowCount, formatNumber);
    return t`Pivot table copied to clipboard, based on the first ${rows} of the result`;
  }
  const rows = formatRowCount(rowCount, formatNumber);
  return t`First ${rows} copied to clipboard`;
}

function copyChartImage(question: Question, includeBranding: boolean) {
  if (!canWriteRichClipboard()) {
    return Promise.reject(
      new Error("Clipboard images are not supported in this browser"),
    );
  }

  // Safari only accepts a clipboard write started inside the click, so the
  // image goes in as a promise
  const blob = getChartImageBlob({
    selector: getChartSelector({ cardId: question.id() }),
    includeBranding,
  }).then((blob) => {
    if (!blob) {
      throw new Error("No chart to copy");
    }
    return blob;
  });
  void blob.catch(() => {});

  return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

// Spreadsheets paste the html flavor as a grid
async function writeResultsToClipboard(text: string, html: string) {
  if (canWriteRichClipboard()) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}
