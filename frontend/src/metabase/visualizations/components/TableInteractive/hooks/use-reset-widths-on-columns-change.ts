import { useEffect, useRef } from "react";
import _ from "underscore";

import type Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";
import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

// Only select fields that define column data identity, excluding technical fields like `ident` or `model/inner_ident`
// that could be added in the future and break column comparison. For example, duplicating a model would produce
// different model/inner_ident values
const DATA_COLUMN_KEYS: (keyof DatasetColumn)[] = [
  "active",
  "base_type",
  "coercion_strategy",
  "database_type",
  "description",
  "binning_info",
  "display_name",
  "effective_type",
  "aggregation_type",
  "entity_id",
  "field_ref",
  "fk_field_id",
  "fk_target_field_id",
  "id",
  "name",
  "nfc_path",
  "parent_id",
  "position",
  "semantic_type",
  "settings",
  "source",
  "table_id",
  "visibility_type",
];

const getColumnDataFields = (datasetColumn: DatasetColumn) => {
  return _.pick(datasetColumn, DATA_COLUMN_KEYS);
};

const getColumnNames = (cols: DatasetColumn[]) => cols.map((col) => col.name);

const getComparableColumns = (cols: DatasetColumn[]) =>
  cols.map(getColumnDataFields).sort((a, b) => a.name.localeCompare(b.name));

const haveSameColumns = (prevCols: DatasetColumn[], cols: DatasetColumn[]) =>
  _.isEqual(getComparableColumns(prevCols), getComparableColumns(cols));

/**
 * Saved widths are positional, so a reorder has to carry each width over by column name. Only columns with a
 * saved width get one in the new order; the rest stay auto-sized.
 */
const reorderWidths = (
  prevCols: DatasetColumn[],
  widths: number[],
  cols: DatasetColumn[],
) => {
  const widthByName = new Map(
    prevCols.map((col, index) => [col.name, widths[index]] as const),
  );
  return cols.map((col) => widthByName.get(col.name));
};

/**
 * Keeps `table.column_widths` in step with the dataset columns: a reorder (drag and drop, viz settings, or a
 * changed query) moves each saved width with its column, while a changed set of columns resets the widths,
 * unless the change is due to the question <-> model conversion.
 */
export function useResetWidthsOnColumnsChange(
  onUpdateVisualizationSettings: (
    settingsUpdate: Partial<VisualizationSettings>,
  ) => void,
  data?: DatasetData,
  question?: Question,
  columnWidths?: number[],
) {
  const prevData = useRef<DatasetData>();
  const prevDataQuestion = useRef<Question>();

  useEffect(() => {
    if (!data) {
      return;
    }

    const prevCols = prevData.current?.cols;
    if (prevCols == null) {
      prevDataQuestion.current = question;
      prevData.current = data;
      return;
    }

    const isSameColumns = haveSameColumns(prevCols, data.cols);
    const isSameOrder = _.isEqual(
      getColumnNames(prevCols),
      getColumnNames(data.cols),
    );
    if (isSameColumns && isSameOrder) {
      return;
    }

    if (isSameColumns) {
      if (columnWidths) {
        onUpdateVisualizationSettings({
          "table.column_widths": reorderWidths(
            prevCols,
            columnWidths,
            data.cols,
          ),
        });
      }
    } else {
      // Check whether question <-> model conversion happened. If so dataset columns change should be ignored
      const isDatasetStatusChange =
        prevDataQuestion.current &&
        (isAdHocModelOrMetricQuestion(question, prevDataQuestion.current) ||
          isAdHocModelOrMetricQuestion(prevDataQuestion.current, question));

      if (!isDatasetStatusChange) {
        onUpdateVisualizationSettings({ "table.column_widths": undefined });
      }
    }

    // Save the current dataset and question for the next comparison.
    // We update these only on a dataset change which happens after question update.
    // Between question update and dataset update there could be rerenders so
    // a simple usePrevious hook would pair the wrong question with the data.
    prevDataQuestion.current = question;
    prevData.current = data;
  }, [data, question, columnWidths, onUpdateVisualizationSettings]);
}
