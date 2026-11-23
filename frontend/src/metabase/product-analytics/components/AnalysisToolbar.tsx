import { Button, Group } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Table, TableId } from "metabase-types/api";

import type { CommonSettings, CommonSettingsOptions } from "../analyses/types";

import { EventTablePicker } from "./EventTablePicker";
import { ViewSqlButton } from "./ViewSqlButton";
import { CountingMenu } from "./toolbar/CountingMenu";
import { DateRangeButton } from "./toolbar/DateRangeButton";
import { FiltersButton } from "./toolbar/FiltersButton";
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
  /** The query the analysis's filters are on. Undefined until it's known. */
  baseQuery: Lib.Query | undefined;
  areFiltersExpanded: boolean;
  onTableChange: (tableId: TableId) => void;
  onChangeSettings: (changes: Partial<CommonSettings>) => void;
  onToggleFilters: () => void;
  onAddFirstFilter: (baseQuery: Lib.Query) => void;
};

/** The controls every analysis shares. */
export const AnalysisToolbar = ({
  table,
  isTableLoading,
  isTablePickerInitiallyOpened,
  settings,
  options,
  query,
  baseQuery,
  areFiltersExpanded,
  onTableChange,
  onChangeSettings,
  onToggleFilters,
  onAddFirstFilter,
}: AnalysisToolbarProps) => (
  <Group justify="space-between" gap="sm">
    <Group gap="sm">
      <Button.Group>
        <EventTablePicker
          table={table}
          isLoading={isTableLoading}
          isInitiallyOpened={isTablePickerInitiallyOpened}
          onChange={onTableChange}
        />
        <FiltersButton
          query={baseQuery}
          isExpanded={areFiltersExpanded}
          onToggle={onToggleFilters}
          onAdd={onAddFirstFilter}
        />
      </Button.Group>
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
