import { useCallback } from "react";
import { DatasetColumn, TableColumnOrderSetting } from "metabase-types/api";
import * as Lib from "metabase-lib";
import { EditWidgetConfig } from "metabase/visualizations/components/settings/ChartSettingTableColumns/types";
import Question from "metabase-lib/Question";
import { DatasetColumnSelector } from "./DatasetColumnSelector";
import { QueryColumnSelector } from "./QueryColumnSelector";

interface ChartSettingTableColumnsProps {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  question?: Question;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], question?: Question) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
}

export const ChartSettingTableColumns = ({
  value,
  columns,
  question,
  getColumnName,
  onChange,
  onShowWidget,
}: ChartSettingTableColumnsProps) => {
  const handleChange = useCallback(
    (newValue: TableColumnOrderSetting[], newQuery?: Lib.Query) => {
      if (newQuery) {
        onChange(newValue, question?._setMLv2Query(newQuery));
      } else {
        onChange(newValue);
      }
    },
    [question, onChange],
  );

  if (question?.isStructured()) {
    const query = question._getMLv2Query();

    return (
      <QueryColumnSelector
        value={value}
        query={query}
        columns={columns}
        getColumnName={getColumnName}
        onChange={handleChange}
        onShowWidget={onShowWidget}
      />
    );
  } else {
    return (
      <DatasetColumnSelector
        value={value}
        columns={columns}
        getColumnName={getColumnName}
        onChange={onChange}
        onShowWidget={onShowWidget}
      />
    );
  }
};
