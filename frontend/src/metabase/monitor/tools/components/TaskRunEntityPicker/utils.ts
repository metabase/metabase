import type { RunEntity } from "metabase-types/api";

import { guardTaskRunEntityType } from "../../utils";

import type { EntityValue } from "./types";

export const convertEntitiesToSelectOptions = (entities?: RunEntity[]) =>
  entities?.map(({ entity_name, entity_type, entity_id }) => ({
    label: entity_name ?? `${entity_type} ${entity_id}`,
    value: serializeValue({
      entityId: entity_id,
      entityType: entity_type,
    }),
  })) ?? [];

export const serializeValue = ({ entityType, entityId }: EntityValue): string =>
  `${entityType}:${entityId}`;

export const parseValue = (serialized: string): EntityValue | null => {
  const [entityType, entityIdStr] = serialized.split(":");
  const entityId = parseInt(entityIdStr, 10);

  if (
    !entityType ||
    !Number.isFinite(entityId) ||
    !guardTaskRunEntityType(entityType)
  ) {
    return null;
  }

  return { entityType, entityId };
};
