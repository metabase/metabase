import { useMemo } from "react";
import { t } from "ttag";

import { useUrlState } from "metabase/common/hooks/use-url-state";
import { useLocation } from "metabase/router";
import { useSetting } from "metabase/settings";
import { AiAnalyticsSectionLayout } from "metabase-enterprise/monitor/ai-auditing/components/AiAnalyticsSectionLayout";
import { NewQuestionButton } from "metabase-enterprise/monitor/ai-auditing/components/NewQuestionButton";
import {
  DATA_APP_LOG_VIEW,
  buildDataAppLogCountQuery,
  getMissingDataAppLogColumns,
  scopeToDataApps,
} from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import { dataAppsAnalyticsUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/url-state";
import {
  ConversationFilters as DataAppsAnalyticsFilterBar,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import { useHasData } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useHasData";

import { DataAppFilterSelect } from "./DataAppFilterSelect";
import { DataAppLogTable } from "./DataAppLogTable";
import { EntityTypeFilterSelect } from "./EntityTypeFilterSelect";

export function DataAppsAnalyticsPage() {
  const location = useLocation();
  const [
    { date, user, app, type, page, sort_column, sort_direction },
    { patchUrlState },
  ] = useUrlState(location, dataAppsAnalyticsUrlStateConfig);

  const { dateFilter, userId, userOptions } = useFilterOptions(
    { date, user, group: null, tenant: null },
    { hasGroupAndTenantFilters: false },
  );

  const hasPii = useSetting("analytics-pii-retention-enabled") === true;
  const audit = useAuditTable(DATA_APP_LOG_VIEW);
  const missingColumns = useMemo(
    () =>
      audit.provider && audit.table
        ? getMissingDataAppLogColumns({
            provider: audit.provider,
            table: audit.table,
          })
        : [],
    [audit.provider, audit.table],
  );
  // Without these columns the page can't scope the log to data apps, so it queries nothing.
  const hasFilterColumns = missingColumns.length === 0;
  const provider = hasFilterColumns ? audit.provider : null;
  const table = hasFilterColumns ? audit.table : null;
  const missingColumnsError = hasFilterColumns
    ? undefined
    : t`The query log is missing the columns this page filters on: ${missingColumns.join(", ")}.`;

  const filters = useMemo(
    () => ({
      dateFilter,
      userId,
      dataAppName: app ?? undefined,
      entityType: type ?? undefined,
    }),
    [app, dateFilter, type, userId],
  );
  const sortingOptions = useMemo(
    () => ({ sort_column, sort_direction }),
    [sort_column, sort_direction],
  );

  const countQuery = useMemo(
    () =>
      provider && table
        ? buildDataAppLogCountQuery({ provider, table, ...filters })
        : null,
    [provider, table, filters],
  );
  const { isInitialLoading, count, error } = useHasData(countQuery);

  return (
    <AiAnalyticsSectionLayout
      title={t`Data app analytics`}
      filtersAction={
        hasFilterColumns && (
          <NewQuestionButton
            viewName={DATA_APP_LOG_VIEW}
            scopeQuery={scopeToDataApps}
          />
        )
      }
      filters={
        <DataAppsAnalyticsFilterBar
          date={date}
          onDateChange={(val) => patchUrlState({ date: val, page: 0 })}
          userFilter={{
            value: user,
            options: userOptions,
            onChange: (val) => patchUrlState({ user: val, page: 0 }),
          }}
          // Data app activity is scoped by app and user, so there's no group or tenant filter.
          extraFilter={
            <>
              <DataAppFilterSelect
                value={app}
                onChange={(val) => patchUrlState({ app: val, page: 0 })}
                provider={provider}
                table={table}
                dateFilter={dateFilter}
              />
              <EntityTypeFilterSelect
                value={type}
                onChange={(val) => patchUrlState({ type: val, page: 0 })}
              />
            </>
          }
        />
      }
      error={error ?? audit.error ?? missingColumnsError}
      isInitialLoading={isInitialLoading}
      isTableRoute
    >
      <DataAppLogTable
        provider={provider}
        table={table}
        filters={filters}
        hasPii={hasPii}
        page={page}
        total={count}
        onPageChange={(newPage) =>
          patchUrlState({ page: newPage }, { immediate: true })
        }
        sortingOptions={sortingOptions}
        onSortingOptionsChange={(newSorting) =>
          patchUrlState({
            sort_column: newSorting.sort_column,
            sort_direction: newSorting.sort_direction,
            page: 0,
          })
        }
      />
    </AiAnalyticsSectionLayout>
  );
}
