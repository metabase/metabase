import { useMemo } from "react";
import { t } from "ttag";

import { useListTaskRunEntitiesQuery } from "metabase/api";
import { Loader, Select, type SelectProps, Tooltip } from "metabase/ui";
import type { RunEntity, TaskRunType } from "metabase-types/api";

export type EntityValue = {
  entityType: RunEntity["entity_type"];
  entityId: RunEntity["entity_id"];
} | null;

type TaskRunEntityPickerProps = Omit<
  SelectProps,
  "data" | "value" | "onChange"
> & {
  runType: TaskRunType | null;
  value: EntityValue;
  onChange: (value: EntityValue) => void;
};

export const TaskRunEntityPicker = ({
  runType,
  value,
  onChange,
  ...props
}: TaskRunEntityPickerProps) => {
  const { data: entities, isLoading } = useListTaskRunEntitiesQuery(
    { "run-type": runType! },
    { skip: !runType },
  );

  const data = useMemo(() => getData(entities), [entities]);

  const serializedValue = value
    ? serializeValue(value.entityType, value.entityId)
    : null;

  const handleChange = (serialized: string | null) => {
    if (!serialized) {
      onChange(null);
      return;
    }
    const parsed = parseValue(serialized);
    onChange(parsed);
  };

  const isDisabled = isLoading || !runType || (!isLoading && data.length === 0);

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

  if (!isLoading && data.length === 0) {
    return <Tooltip label={t`No entities available`}>{select}</Tooltip>;
  }

  return select;
};

function getData(entities?: RunEntity[]) {
  if (!entities) {
    return [];
  }

  return entities.map((entity) => ({
    label: entity.entity_name ?? `${entity.entity_type} ${entity.entity_id}`,
    value: serializeValue(entity.entity_type, entity.entity_id),
  }));
}

function serializeValue(
  entityType: RunEntity["entity_type"],
  entityId: RunEntity["entity_id"],
): string {
  return `${entityType}:${entityId}`;
}

function parseValue(serialized: string): EntityValue {
  const [entityType, entityIdStr] = serialized.split(":");
  const entityId = parseInt(entityIdStr, 10);

  if (!entityType || !Number.isFinite(entityId)) {
    return null;
  }

  return {
    entityType: entityType as RunEntity["entity_type"],
    entityId,
  };
}
