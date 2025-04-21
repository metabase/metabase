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
  "aggregation_index",
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
  "source_alias",
  "table_id",
  "visibility_type",
];

const getColumnDataFields = (datasetColumn: DatasetColumn) => {
  return _.pick(datasetColumn, DATA_COLUMN_KEYS);
};

/**
 * Reset table column widths when the dataset columns change
 * unless it is due to the question <-> model conversion
 */
export function useResetWidthsOnColumnsChange(
  onUpdateVisualizationSettings: (
    settingsUpdate: Partial<VisualizationSettings>,
  ) => void,
  data?: DatasetData,
  question?: Question,
) {
  const prevData = useRef<DatasetData>();
  const prevDataQuestion = useRef<Question>();

  useEffect(() => {
    const isDataChange =
      prevData.current &&
      data &&
      !_.isEqual(
        prevData.current.cols.map(getColumnDataFields),
        data.cols.map(getColumnDataFields),
      );

    if (isDataChange) {
      // Check whether question <-> model conversion happened. If so dataset columns change should be ignored
      const isDatasetStatusChange =
        prevDataQuestion.current &&
        (isAdHocModelOrMetricQuestion(question, prevDataQuestion.current) ||
          isAdHocModelOrMetricQuestion(prevDataQuestion.current, question));

      if (!isDatasetStatusChange) {
        onUpdateVisualizationSettings({ "table.column_widths": undefined });
      }

      // Save the current dataset and question for the next comparison.
      // We update these only on a dataset change which happens after question update.
      // Between question update and dataset update there could be rerenders so
      // a simple usePrevious hook would pair the wrong question with the data.
      prevDataQuestion.current = question;
      prevData.current = data;
    } else if (prevData.current == null && data) {
      // Sets initial prevData and prevDataQuestion
      prevDataQuestion.current = question;
      prevData.current = data;
    }
  }, [data, question, onUpdateVisualizationSettings]);
}
