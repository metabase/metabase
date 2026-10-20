import { useMemo } from "react";
import { t } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { readEventQuery } from "../../events/read-event-query";
import type { EventDefinition } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";
import { useTableQuery } from "../events/use-table-query";

const STAGE = -1;

type FiltersWidgetProps = SettingWidgetProps<EventDefinition | null> & {
  table: Table | undefined;
};

/**
 * Filters on the event table, as pills like the query builder's filter step.
 * They're stored like an event definition, whose query only holds filters.
 */
export const FiltersWidget = ({
  value,
  onChange,
  table,
}: FiltersWidgetProps) => {
  const tableQuery = useTableQuery(table);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const query = useMemo(
    () =>
      (value !== null ? readEventQuery(metadataProvider, value) : null) ??
      tableQuery,
    [value, metadataProvider, tableQuery],
  );

  if (query === undefined) {
    return null;
  }

  const filters = Lib.filters(query, STAGE);
  const updateQuery = (nextQuery: Lib.Query) => {
    const hasFilters = Lib.filters(nextQuery, STAGE).length > 0;
    onChange(
      hasFilters ? { name: t`Filters`, query: Lib.toJsQuery(nextQuery) } : null,
    );
  };

  return (
    <ClauseStep
      color="core-filter"
      items={filters}
      initialAddText={t`Add a filter`}
      renderName={(filter) => Lib.displayInfo(query, STAGE, filter).displayName}
      renderPopover={({ item: filter, index, onClose }) => (
        <FilterPicker
          query={query}
          stageIndex={STAGE}
          filter={filter}
          filterIndex={index}
          onSelect={(nextFilter) =>
            updateQuery(
              filter !== undefined
                ? Lib.replaceClause(query, STAGE, filter, nextFilter)
                : Lib.filter(query, STAGE, nextFilter),
            )
          }
          onClose={onClose}
        />
      )}
      onReorder={(source, target) =>
        updateQuery(Lib.swapClauses(query, STAGE, source, target))
      }
      onRemove={(filter) => updateQuery(Lib.removeClause(query, STAGE, filter))}
    />
  );
};
