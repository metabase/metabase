import { Group } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Table, TableId } from "metabase-types/api";

import type { CommonSettings, CommonSettingsOptions } from "../analyses/types";

import { EventTablePicker } from "./EventTablePicker";
import { ViewSqlButton } from "./ViewSqlButton";
import { CountingMenu } from "./toolbar/CountingMenu";
import { DateRangeButton } from "./toolbar/DateRangeButton";
import { GranularityButton } from "./toolbar/GranularityButton";

type AnalysisToolbarProps = {
  table: Table | undefined;
  isTableLoading: boolean;
  isTablePickerInitiallyOpened: boolean;
  /** Undefined until the analysis's settings are computed. */
  settings: CommonSettings | undefined;
  options: CommonSettingsOptions;
  /** Undefined until the analysis's query is built. */
  query: Lib.Query | undefined;
  onTableChange: (tableId: TableId) => void;
  onChangeSettings: (changes: Partial<CommonSettings>) => void;
};

/** The controls every analysis shares. */
export const AnalysisToolbar = ({
  table,
  isTableLoading,
  isTablePickerInitiallyOpened,
  settings,
  options,
  query,
  onTableChange,
  onChangeSettings,
}: AnalysisToolbarProps) => (
  <Group justify="space-between" gap="sm">
    <Group gap="sm">
      <EventTablePicker
        table={table}
        isLoading={isTableLoading}
        isInitiallyOpened={isTablePickerInitiallyOpened}
        onChange={onTableChange}
      />
      {settings !== undefined && <CountingMenu value={settings.counting} />}
    </Group>
    <Group gap="sm">
      {settings !== undefined && (
        <>
          <DateRangeButton
            value={settings.date_range}
            onChange={(date_range) => onChangeSettings({ date_range })}
          />
          <GranularityButton
            value={settings.granularity}
            units={options.granularities}
            onChange={(granularity) => onChangeSettings({ granularity })}
          />
        </>
      )}
      {query !== undefined && <ViewSqlButton query={query} />}
    </Group>
  </Group>
);
