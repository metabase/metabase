import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListTaskRunEntitiesQuery } from "metabase/api";
import { Loader, Select, type SelectProps, Tooltip } from "metabase/ui";
import type { TaskRunDateFilterOption, TaskRunType } from "metabase-types/api";

import type { EntityValue } from "./types";
import {
  convertEntitiesToSelectOptions,
  parseValue,
  serializeValue,
} from "./utils";

type TaskRunEntityPickerProps = Omit<
  SelectProps,
  "data" | "value" | "onChange"
> & {
  runType: TaskRunType | null;
  startedAt: TaskRunDateFilterOption | null;
  value: EntityValue | null;
  onChange: (value: EntityValue | null) => void;
};

export const TaskRunEntityPicker = ({
  runType,
  startedAt,
  value,
  onChange,
  ...props
}: TaskRunEntityPickerProps) => {
  const hasAllRequiredParams = runType && startedAt;
  const { data: entities, isLoading } = useListTaskRunEntitiesQuery(
    hasAllRequiredParams
      ? {
          "run-type": runType,
          "started-at": startedAt,
        }
      : skipToken,
  );

  const data = useMemo(
    () => convertEntitiesToSelectOptions(entities),
    [entities],
  );

  const serializedValue = value ? serializeValue(value) : null;

  const handleChange = (serialized: string | null) => {
    if (!serialized) {
      onChange(null);
      return;
    }
    const parsed = parseValue(serialized);
    onChange(parsed);
  };

  const isDisabled =
    isLoading || !hasAllRequiredParams || (!isLoading && data.length === 0);

  const select = (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        width: 300,
      }}
      clearable
      data={data}
      disabled={isDisabled}
      placeholder={t`Filter by entity`}
      rightSection={isLoading ? <Loader size="xs" /> : undefined}
      searchable
      value={serializedValue}
      onChange={handleChange}
      {...props}
    />
  );

  if (!runType) {
    return <Tooltip label={t`Select a run type first`}>{select}</Tooltip>;
  }

  if (!startedAt) {
    return <Tooltip label={t`Select a start time first`}>{select}</Tooltip>;
  }

  if (!isLoading && data.length === 0) {
    return <Tooltip label={t`No entities available`}>{select}</Tooltip>;
  }

  return select;
};
