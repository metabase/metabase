import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { Select } from "metabase/ui";
import { useListDataAppsQuery } from "metabase-enterprise/api";
import { buildLoggedDataAppsQuery } from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import { FILTER_WIDTH } from "metabase-enterprise/monitor/constants";
import * as Lib from "metabase-lib";
import type { DataApp, RowValue } from "metabase-types/api";

const ALL_DATA_APPS = "";

// A selected app that isn't installed is listed under "Removed" even when the log doesn't name it, so the
// select never shows blank.
function getDataAppOptions(
  dataApps: readonly DataApp[],
  loggedNames: readonly RowValue[],
  selectedName: string | null,
) {
  const installed = dataApps.map((dataApp) => ({
    value: dataApp.name,
    label: dataApp.display_name,
  }));
  const installedNames = new Set(installed.map((option) => option.value));
  const removedNames = new Set(
    [...loggedNames, selectedName].filter(
      (name): name is string =>
        typeof name === "string" && !installedNames.has(name),
    ),
  );
  const removed = [...removedNames]
    .sort()
    .map((name) => ({ value: name, label: name }));
  return [
    // A group without a name renders no heading, so "All data apps" stands on its own.
    { group: "", items: [{ value: ALL_DATA_APPS, label: t`All data apps` }] },
    { group: t`Installed`, items: installed },
    { group: t`Removed`, items: removed },
  ].filter((group) => group.items.length > 0);
}

type DataAppFilterSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  provider: Lib.MetadataProvider | null;
  table: Lib.TableMetadata | Lib.CardMetadata | null;
  dateFilter: DateFilterValue;
};

export function DataAppFilterSelect({
  value,
  onChange,
  provider,
  table,
  dateFilter,
}: DataAppFilterSelectProps) {
  const { data: dataApps } = useListDataAppsQuery();

  const loggedDataAppsQuery = useMemo(
    () =>
      provider && table
        ? Lib.toJsQuery(
            buildLoggedDataAppsQuery({ provider, table, dateFilter }),
          )
        : skipToken,
    [provider, table, dateFilter],
  );
  const { data: loggedDataApps } = useGetAdhocQueryQuery(loggedDataAppsQuery);

  const options = useMemo(
    () =>
      getDataAppOptions(
        dataApps ?? [],
        (loggedDataApps?.data?.rows ?? []).map(([name]) => name),
        value,
      ),
    [dataApps, loggedDataApps, value],
  );

  return (
    <Select
      data={options}
      value={value ?? ALL_DATA_APPS}
      onChange={(val) => onChange(val === ALL_DATA_APPS ? null : val)}
      aria-label={t`Data app`}
      searchable
      w={FILTER_WIDTH}
      bdrs="xs"
      data-testid="data-app-filter-select"
    />
  );
}
