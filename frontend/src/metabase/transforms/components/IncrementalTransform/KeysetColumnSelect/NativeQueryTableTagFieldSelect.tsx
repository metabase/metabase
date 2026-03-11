import { useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { tableApi } from "metabase/api";
import { FormSelect } from "metabase/forms";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Alert,
  type DataAttributes,
  type InputDescriptionProps,
  Loader,
  type SelectOption,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api/table";

import { getSourceFieldOptions } from "./KeysetColumnSelect";

type NativeQueryTableTagFieldSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  query: Lib.Query;
  disabled?: boolean;
  autoSelectFirst?: boolean;
};

const selectTableQueryMetadata =
  tableApi.endpoints.getTableQueryMetadata.select;

/**
 * Hook that fetches table query metadata for a dynamic list of table IDs.
 * Uses RTK Query's initiate/select pattern to avoid the "hooks in a loop" problem.
 */
function useTableQueryMetadataResults(tableIds: number[]) {
  const dispatch = useDispatch();

  useEffect(() => {
    const subscriptions = tableIds.map((id) =>
      dispatch(tableApi.endpoints.getTableQueryMetadata.initiate({ id })),
    );
    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [dispatch, tableIds]);

  const selectors = useMemo(
    () => tableIds.map((id) => selectTableQueryMetadata({ id })),
    [tableIds],
  );

  return useSelector((state) => {
    const results = selectors.map((sel) => sel(state));
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    const tables = results
      .map((r) => r.data)
      .filter((t): t is Table => t != null);
    return { isLoading, hasError, tables };
  });
}

export function NativeQueryTableTagFieldSelect({
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  query,
  disabled,
  autoSelectFirst,
}: NativeQueryTableTagFieldSelectProps) {
  const { setFieldValue, values } =
    useFormikContext<Record<string, string | null>>();
  const metadata = useSelector(getMetadata);

  const tableIds = useMemo(() => {
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

  const { isLoading, hasError, tables } =
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

  const noQueryMessage = useMemo(() => {
    if (tableIds.length === 0) {
      return t`Native queries must use at least one table template tag to enable incremental transforms`;
    }
    if (hasError) {
      return t`Unable to load table metadata. You may not have permission to access the table.`;
    }
    return null;
  }, [tableIds, hasError]);

  useEffect(() => {
    if (
      !autoSelectFirst ||
      disabled ||
      isLoading ||
      fieldOptions.length === 0
    ) {
      return;
    }

    const currentValue = values[name];
    const hasValidCurrentValue =
      currentValue != null &&
      fieldOptions.some((option) => option.value === currentValue);

    if (hasValidCurrentValue) {
      return;
    }

    setFieldValue(name, fieldOptions[0].value);
  }, [
    autoSelectFirst,
    disabled,
    fieldOptions,
    isLoading,
    name,
    setFieldValue,
    values,
  ]);

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
