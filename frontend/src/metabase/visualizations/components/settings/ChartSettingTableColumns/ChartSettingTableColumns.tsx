import { useCallback } from "react";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import * as Lib from "metabase-lib";
import type { EditWidgetConfig } from "metabase/visualizations/components/settings/ChartSettingTableColumns/types";
import type Question from "metabase-lib/Question";
import { DatasetColumnSelector } from "./DatasetColumnSelector";
import { QueryColumnSelector } from "./QueryColumnSelector";

interface ChartSettingTableColumnsProps {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  question?: Question;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], question?: Question) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
  onWidgetOverride: (key: string) => void;
}

export const ChartSettingTableColumns = ({
  value,
  columns,
  question,
  getColumnName,
  onChange,
  onShowWidget,
  onWidgetOverride,
}: ChartSettingTableColumnsProps) => {
  const handleChange = useCallback(
    (newValue: TableColumnOrderSetting[], newQuery?: Lib.Query) => {
      if (newQuery) {
        onChange(newValue, question?.setQuery(newQuery));
      } else {
        onChange(newValue);
      }
    },
    [question, onChange],
  );

  const isNative = question && Lib.queryDisplayInfo(question.query()).isNative;

  if (question && !isNative) {
    const query = question.query();

    return (
      <QueryColumnSelector
        handleWidgetOverride={onWidgetOverride}
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
