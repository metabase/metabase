import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import type Question from "metabase-lib/Question";
import { DatasetColumnSelector } from "./DatasetColumnSelector";
import { getColumnSettings } from "./utils";
import type { EditWidgetData } from "./types";

interface ChartSettingTableColumnsProps {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  question: Question;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], question?: Question) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
}

export const ChartSettingTableColumns = ({
  value,
  columns,
  question,
  getColumnName,
  onChange,
  onShowWidget,
}: ChartSettingTableColumnsProps) => {
  const query = question.query();
  const stageIndex = -1;
  const settings = getColumnSettings(value);

  return (
    <DatasetColumnSelector
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      settings={settings}
      getColumnName={getColumnName}
      onChange={onChange}
      onShowWidget={onShowWidget}
    />
  );
};
