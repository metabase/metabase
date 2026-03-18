import { useMemo } from "react";
import { t } from "ttag";

import { FormSelect } from "metabase/forms";
import {
  Alert,
  type DataAttributes,
  Icon,
  type InputDescriptionProps,
  Loader,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useAutoSelectFirstOption } from "../useAutoSelectFirstOption";
import { useNativeCheckpointFieldOptions } from "../useNativeCheckpointFieldOptions";

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
  const { fieldOptions, isLoading, tableIds, hasError } =
    useNativeCheckpointFieldOptions(query);

  const noQueryMessage = useMemo(() => {
    if (tableIds.length === 0) {
      return t`Native queries must use at least one table variable to enable incremental transforms`;
    }
    if (hasError) {
      return t`Unable to load table metadata. You may not have permission to access the table.`;
    }
    return null;
  }, [tableIds, hasError]);

  useAutoSelectFirstOption({
    name,
    options: fieldOptions,
    disabled: disabled || isLoading,
  });

  if (noQueryMessage) {
    return (
      <Alert icon={<Icon name="warning" />} color="warning">
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
