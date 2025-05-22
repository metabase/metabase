import type {
  DatasetColumn,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { ConfigureTableActions } from "./ConfigureTableActions";

export interface ChartSettingsTableFormattingProps {
  value: TableActionDisplaySettings[];
  onChange: (actions: TableActionDisplaySettings[]) => void;
  cols: DatasetColumn[];
}

export const ChartSettingsTableActions = ({
  value,
  onChange,
  cols,
}: ChartSettingsTableFormattingProps) => {
  return (
    <ConfigureTableActions
      tableActions={value}
      columns={cols}
      onChange={onChange}
    />
  );
};
