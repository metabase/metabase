import { useEffect, useState } from "react";
import { useLatest } from "react-use";

import { useExtractColumnsFromQueryMutation } from "metabase/api";
import { FormSelect, FormTextInput } from "metabase/forms";
import {
  type DataAttributes,
  type InputDescriptionProps,
  Loader,
} from "metabase/ui";
import * as Lib from "metabase-lib";

type NativeQueryColumnSelectProps = {
  name: string;
  label: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  placeholder: string;
  query: Lib.Query;
  disabled?: boolean;
};

export function NativeQueryColumnSelect({
  name,
  label,
  description,
  descriptionProps,
  placeholder,
  query,
  disabled,
}: NativeQueryColumnSelectProps) {
  const [columns, setColumns] = useState<string[] | null>(null);
  const [extractColumns, { isLoading }] = useExtractColumnsFromQueryMutation();

  const queryRef = useLatest(query);

  useEffect(() => {
    let isCancelled = false;
    if (
      columns &&
      Lib.areLegacyQueriesEqual(
        Lib.toLegacyQuery(queryRef.current),
        Lib.toLegacyQuery(query),
      )
    ) {
      return;
    }

    const extract = async () => {
      try {
        const result = await extractColumns({
          query: Lib.toJsQuery(query),
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
  }, [extractColumns, query, queryRef, columns]);

  // If we successfully extracted columns, show a selector
  if (columns && columns.length > 0) {
    return (
      <FormSelect
        name={name}
        rightSection={isLoading ? <Loader size="sm" /> : null}
        disabled={disabled || isLoading}
        label={label}
        description={description}
        placeholder={placeholder}
        data={columns.map((col) => ({ value: col, label: col }))}
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
      descriptionProps={descriptionProps}
      disabled={disabled}
    />
  );
}
