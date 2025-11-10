import { useEffect, useState } from "react";
import { t } from "ttag";

import { FormSelect, FormTextInput } from "metabase/forms";
import { Loader, Stack, Text } from "metabase/ui";
import { useExtractColumnsFromNativeQueryMutation } from "metabase-enterprise/api";
import type { DatabaseId } from "metabase-types/api";

type NativeQueryColumnSelectProps = {
  name: string;
  label: string;
  description: string;
  placeholder: string;
  databaseId: DatabaseId;
  nativeQuery: string;
};

export function NativeQueryColumnSelect({
  name,
  label,
  description,
  placeholder,
  databaseId,
  nativeQuery,
}: NativeQueryColumnSelectProps) {
  const [columns, setColumns] = useState<string[] | null>(null);
  const [extractColumns, { isLoading }] =
    useExtractColumnsFromNativeQueryMutation();

  useEffect(() => {
    let isCancelled = false;

    const extract = async () => {
      try {
        const result = await extractColumns({
          database_id: databaseId,
          native_query: nativeQuery,
        }).unwrap();

        if (!isCancelled) {
          // Only use columns if we got at least one
          setColumns(result.columns.length > 0 ? result.columns : null);
        }
      } catch (error) {
        // On error, fall back to text input
        if (!isCancelled) {
          setColumns(null);
        }
      }
    };

    extract();

    return () => {
      isCancelled = true;
    };
  }, [databaseId, nativeQuery, extractColumns]);

  if (isLoading) {
    return (
      <Stack spacing="xs">
        <Text fw="bold" size="sm">
          {label}
        </Text>
        <Loader size="sm" />
      </Stack>
    );
  }

  // If we successfully extracted columns, show a selector
  if (columns && columns.length > 0) {
    return (
      <FormSelect
        name={name}
        label={label}
        description={description}
        placeholder={placeholder}
        data={columns.map(col => ({ value: col, label: col }))}
      />
    );
  }

  // Otherwise, fall back to text input
  return (
    <FormTextInput
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
    />
  );
}
