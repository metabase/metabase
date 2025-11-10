import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { FormSelect, FormTextInput } from "metabase/forms";
import { Loader, Stack, Text } from "metabase/ui";
import { useExtractColumnsFromQueryMutation } from "metabase-enterprise/api";
import type { DatasetQuery } from "metabase-types/api";

type NativeQueryColumnSelectProps = {
  name: string;
  label: string;
  description: string;
  placeholder: string;
  query: DatasetQuery;
};

export function NativeQueryColumnSelect({
  name,
  label,
  description,
  placeholder,
  query,
}: NativeQueryColumnSelectProps) {
  const [columns, setColumns] = useState<string[] | null>(null);
  const [extractColumns, { isLoading }] = useExtractColumnsFromQueryMutation();

  // Create a stable serialized version of the query for dependency tracking
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    let isCancelled = false;

    const extract = async () => {
      try {
        const result = await extractColumns({
          query,
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
  }, [queryKey, extractColumns]);

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
