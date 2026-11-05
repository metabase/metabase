import { GeneratedChecksSummary } from "metabase/metadata/table-structure/generated-checks";
import { Loader } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useHistoryChecks } from "./use-history-checks";

export function HistoryChecksSummary({ table }: { table: Table }) {
  const generated = useHistoryChecks(table);
  if (generated == null) {
    return <Loader size="xs" />;
  }
  return (
    <GeneratedChecksSummary
      table={generated.tableRef}
      checks={generated.checks}
      results={generated.results}
    />
  );
}
