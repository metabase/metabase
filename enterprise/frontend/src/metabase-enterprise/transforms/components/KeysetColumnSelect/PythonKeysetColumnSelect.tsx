import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { FormSelect } from "metabase/forms";
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

  const columnOptions = useMemo((): Array<{ value: string; label: string }> => {
    if (!table || !table.fields) {
      return [];
    }

    // Filter to only numeric fields
    const numericFields = table.fields.filter((field) => {
      const baseType = field.base_type;
      return (
        baseType === "type/Integer" ||
        baseType === "type/BigInteger" ||
        baseType === "type/Decimal" ||
        baseType === "type/Float"
      );
    });

    // Convert to select options
    return numericFields.map((field) => {
      // Create a field ref using MLv2 format: ["field", field-id, null]
      const fieldRef = ["field", field.id, null];

      return {
        value: JSON.stringify(fieldRef),
        label: field.display_name || field.name,
      };
    });
  }, [table]);

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
