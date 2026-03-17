import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { SelectOption } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isConcreteTableId } from "metabase-types/api/table";

import { getSourceFieldOptions } from "./KeysetColumnSelect/KeysetColumnSelect";
import { useTableQueryMetadataResults } from "./useTableQueryMetadataResults";

export function useNativeCheckpointFieldOptions(query: Lib.Query | null) {
  const metadata = useSelector(getMetadata);

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
  }, [tables, metadata]);

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
