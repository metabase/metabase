import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Alert,
  type DataAttributes,
  type InputDescriptionProps,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { KeysetColumnSelect } from "./KeysetColumnSelect";

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
  const tableIds = useMemo(() => {
    try {
      const templateTags = Lib.templateTags(query);
      const tableTags = Object.values(templateTags).filter(
        (tag) => tag.type === "table" && tag["table-id"] != null,
      );
      return tableTags.map((tag) => tag["table-id"]!);
    } catch {
      return [];
    }
  }, [query]);

  // For now, we only support the first table tag (like Python transforms only support single tables)
  // Multiple table tags can be supported in the future if needed
  const firstTableId = tableIds.length > 0 ? tableIds[0] : null;

  const {
    data: table,
    isLoading,
    isError: hasError,
  } = useGetTableQueryMetadataQuery(
    firstTableId ? { id: firstTableId } : skipToken,
  );

  // Create a query from the table to get column metadata
  const syntheticQuery = useMemo(() => {
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
    } catch (error) {
      console.error(
        "NativeQueryTableTagFieldSelect: Error building query:",
        error,
      );
      return null;
    }
  }, [table, metadata]);

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
    <KeysetColumnSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      descriptionProps={descriptionProps}
      query={syntheticQuery}
      disabled={disabled || !syntheticQuery}
      isLoading={isLoading}
    />
  );
}
