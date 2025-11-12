import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { FormSelect } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { PythonTransformTableAliases } from "metabase-types/api";

type PythonKeysetColumnSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: string;
  sourceTables: PythonTransformTableAliases;
};

export function PythonKeysetColumnSelect({
  name,
  label,
  placeholder,
  description,
  sourceTables,
}: PythonKeysetColumnSelectProps) {
  const metadata = useSelector(getMetadata);

  // Get the first (and should be only) table ID
  // Incremental transforms are only supported for single-table Python transforms
  const tableId = useMemo(() => {
    const tableIds = Object.values(sourceTables);
    return tableIds.length === 1 ? tableIds[0] : null;
  }, [sourceTables]);

  // Fetch metadata for the table
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(tableId ? { id: tableId } : skipToken);

  // Create a query from the table to get column metadata
  const query = useMemo(() => {
    if (!table || !table.db_id) {
      return null;
    }

    try {
      const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
      const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
      if (!tableMetadata) {
        return null;
      }
      return Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
    } catch {
      return null;
    }
  }, [table, metadata]);

  const columnOptions = useMemo((): Array<{ value: string; label: string }> => {
    if (!query) {
      return [];
    }

    try {
      const stageIndex = -1;
      const filterableColumns = Lib.filterableColumns(query, stageIndex);

      // Filter to only numeric columns
      const numericColumns = filterableColumns.filter((column) =>
        Lib.isNumeric(column),
      );

      // Deduplicate by unique key (keep first occurrence)
      const seenKeys = new Set<string>();
      const uniqueColumns: Array<{ value: string; label: string }> = [];

      numericColumns.forEach((column) => {
        const uniqueKey = Lib.columnUniqueKey(column);

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          const columnInfo = Lib.displayInfo(query, stageIndex, column);
          uniqueColumns.push({
            value: uniqueKey,
            label: columnInfo.displayName,
          });
        }
      });

      return uniqueColumns;
    } catch {
      return [];
    }
  }, [query]);

  return (
    <FormSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      data={columnOptions}
      searchable
      disabled={isLoading || !!error || columnOptions.length === 0}
    />
  );
}
