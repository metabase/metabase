import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { FormSelect } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Alert,
  type DataAttributes,
  type InputDescriptionProps,
  Loader,
  type SelectOption,
} from "metabase/ui";
import * as Lib from "metabase-lib";

type NativeQueryTableTagFieldSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  query: Lib.Query;
  disabled?: boolean;
};

export function NativeQueryTableTagFieldSelect({
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  query,
  disabled,
}: NativeQueryTableTagFieldSelectProps) {
  const metadata = useSelector(getMetadata);

  // Extract table template tags from the native query
  // Limit to 10 tables to keep hook calls manageable
  const tableIds = useMemo(() => {
    try {
      const templateTags = Lib.templateTags(query);
      const tableTags = Object.values(templateTags).filter(
        (tag) => tag.type === "table" && tag["table-id"] != null,
      );
      return tableTags.map((tag) => tag["table-id"]!).slice(0, 10);
    } catch {
      return [];
    }
  }, [query]);

  // Fetch metadata for up to 10 tables (hooks must be called unconditionally)
  const table0 = useGetTableQueryMetadataQuery(
    tableIds[0] != null ? { id: tableIds[0] } : skipToken,
  );
  const table1 = useGetTableQueryMetadataQuery(
    tableIds[1] != null ? { id: tableIds[1] } : skipToken,
  );
  const table2 = useGetTableQueryMetadataQuery(
    tableIds[2] != null ? { id: tableIds[2] } : skipToken,
  );
  const table3 = useGetTableQueryMetadataQuery(
    tableIds[3] != null ? { id: tableIds[3] } : skipToken,
  );
  const table4 = useGetTableQueryMetadataQuery(
    tableIds[4] != null ? { id: tableIds[4] } : skipToken,
  );
  const table5 = useGetTableQueryMetadataQuery(
    tableIds[5] != null ? { id: tableIds[5] } : skipToken,
  );
  const table6 = useGetTableQueryMetadataQuery(
    tableIds[6] != null ? { id: tableIds[6] } : skipToken,
  );
  const table7 = useGetTableQueryMetadataQuery(
    tableIds[7] != null ? { id: tableIds[7] } : skipToken,
  );
  const table8 = useGetTableQueryMetadataQuery(
    tableIds[8] != null ? { id: tableIds[8] } : skipToken,
  );
  const table9 = useGetTableQueryMetadataQuery(
    tableIds[9] != null ? { id: tableIds[9] } : skipToken,
  );

  // Memoize the array to avoid recreating it on every render
  const tableQueries = useMemo(
    () => [
      table0,
      table1,
      table2,
      table3,
      table4,
      table5,
      table6,
      table7,
      table8,
      table9,
    ],
    [
      table0,
      table1,
      table2,
      table3,
      table4,
      table5,
      table6,
      table7,
      table8,
      table9,
    ],
  );

  const isLoading = tableQueries.some((q) => q.isLoading);
  const hasError = tableQueries.some((q) => q.isError);

  const tables = useMemo(
    () =>
      tableQueries
        .map((q) => q.data)
        .filter((t): t is NonNullable<typeof t> => t != null),
    [tableQueries],
  );

  // Extract field options from all tables
  const fieldOptions = useMemo((): Array<SelectOption> => {
    if (tables.length === 0) {
      return [];
    }

    try {
      const allOptions: Array<SelectOption> = [];
      const seenFieldIds = new Set<number>();
      const showTablePrefix = tables.length > 1;

      for (const table of tables) {
        const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
        const tableMetadata = Lib.tableOrCardMetadata(
          metadataProvider,
          table.id,
        );
        if (!tableMetadata) {
          continue;
        }

        const query = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          tableMetadata,
        );
        const stageIndex = -1;

        // Get columns from this table
        const returnedColumns = Lib.returnedColumns(query, stageIndex);
        const filterableColumns = Lib.filterableColumns(query, stageIndex);

        const filterableIdentifiers = new Set(
          filterableColumns.map((col) => Lib.columnKey(col)),
        );

        // Filter to numeric/temporal columns with field IDs
        const numericFilterableColumns = returnedColumns.filter((column) => {
          return (
            filterableIdentifiers.has(Lib.columnKey(column)) &&
            (Lib.isNumeric(column) || Lib.isTemporal(column))
          );
        });

        for (const column of numericFilterableColumns) {
          // Extract field ID from column
          const legacyRef = Lib.legacyRef(query, stageIndex, column);
          let fieldId: number | null = null;

          if (
            Array.isArray(legacyRef) &&
            legacyRef[0] === "field" &&
            typeof legacyRef[1] === "number"
          ) {
            fieldId = legacyRef[1];
          }

          if (fieldId == null || seenFieldIds.has(fieldId)) {
            continue;
          }

          seenFieldIds.add(fieldId);

          const columnInfo = Lib.displayInfo(query, stageIndex, column);
          // When multiple tables, prepend table name for clarity
          const label = showTablePrefix
            ? `${table.display_name || table.name}: ${columnInfo.displayName}`
            : columnInfo.displayName;

          allOptions.push({ value: String(fieldId), label });
        }
      }

      return allOptions;
    } catch (error) {
      console.error(
        "NativeQueryTableTagFieldSelect: Error extracting fields:",
        error,
      );
      return [];
    }
  }, [tables, metadata]);

  // Determine the message to show when no query can be built
  const noQueryMessage = useMemo(() => {
    if (tableIds.length === 0) {
      return t`Native queries must use at least one table template tag to enable incremental transforms`;
    }
    if (hasError) {
      return t`Unable to load table metadata. You may not have permission to access the table.`;
    }
    return null;
  }, [tableIds, hasError]);

  if (noQueryMessage) {
    return (
      <Alert variant="warning" mb="md">
        {noQueryMessage}
      </Alert>
    );
  }

  return (
    <FormSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      descriptionProps={descriptionProps}
      data={fieldOptions}
      searchable
      disabled={disabled || fieldOptions.length === 0}
      rightSection={isLoading ? <Loader size="xs" /> : undefined}
    />
  );
}
