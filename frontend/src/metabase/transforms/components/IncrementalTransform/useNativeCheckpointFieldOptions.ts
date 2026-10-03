import { useMemo } from "react";

import { useMetadataProviderFactory } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import { isConcreteTableId } from "metabase-types/api/table";

import { getSourceFieldOptions } from "./KeysetColumnSelect/KeysetColumnSelect";
import type { CheckpointFieldOption } from "./useClearUnsupportedLookback";
import { useTableQueryMetadataResults } from "./useTableQueryMetadataResults";

export function useNativeCheckpointFieldOptions(query: Lib.Query | null) {
  const getMetadataProvider = useMetadataProviderFactory();

  const tableIds = useMemo(() => {
    if (!query) {
      return [];
    }
    try {
      const templateTags = Lib.templateTags(query);
      const tableTags = Object.values(templateTags).filter(
        (tag) => tag.type === "table" && tag["table-id"] != null,
      );
      return tableTags.map((tag) => tag["table-id"]).filter(isConcreteTableId);
    } catch {
      return [];
    }
  }, [query]);

  const { tables, isLoading, hasError } =
    useTableQueryMetadataResults(tableIds);

  const fieldOptions = useMemo((): Array<CheckpointFieldOption> => {
    if (tables.length === 0) {
      return [];
    }

    try {
      const allOptions: Array<CheckpointFieldOption> = [];
      const seenFieldIds = new Set<number>();
      const showTablePrefix = tables.length > 1;

      for (const table of tables) {
        const metadataProvider = getMetadataProvider(table.db_id);
        const tableMetadata = Lib.tableOrCardMetadata(
          metadataProvider,
          table.id,
        );
        if (!tableMetadata) {
          continue;
        }

        const tableQuery = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          tableMetadata,
        );

        const options = getSourceFieldOptions(tableQuery, {
          labelPrefix: showTablePrefix
            ? table.display_name || table.name
            : undefined,
          seenFieldIds,
        });

        allOptions.push(...options);
      }

      return allOptions;
    } catch (error) {
      console.error(
        "NativeQueryTableTagFieldSelect: Error extracting fields:",
        error,
      );
      return [];
    }
  }, [tables, getMetadataProvider]);

  return {
    fieldOptions,
    isLoading,
    tableIds,
    hasError,
  };
}

export function useNativeHasCheckpointFieldOptions(query: Lib.Query | null) {
  const { fieldOptions } = useNativeCheckpointFieldOptions(query);

  return fieldOptions.length > 0;
}
