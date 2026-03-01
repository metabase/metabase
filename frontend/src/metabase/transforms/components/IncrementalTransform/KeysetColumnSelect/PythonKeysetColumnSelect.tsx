import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { DataAttributes, InputDescriptionProps } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { PythonTransformTableAliases } from "metabase-types/api";

import { KeysetColumnSelect } from "./KeysetColumnSelect";

type PythonKeysetColumnSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  sourceTables: PythonTransformTableAliases;
  disabled?: boolean;
};

export function PythonKeysetColumnSelect({
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  sourceTables,
  disabled,
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

  return (
    <KeysetColumnSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      descriptionProps={descriptionProps}
      query={query}
      disabled={disabled || !!error}
      isLoading={isLoading}
    />
  );
}
