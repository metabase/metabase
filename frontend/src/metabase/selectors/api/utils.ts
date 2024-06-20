import dayjs from "dayjs";

import { isNullOrUndefined } from "metabase/lib/types";

import type { Entity, EntityEntries } from "./types";

export const zipEntitySources = <
  Entity extends { id: string | number; updated_at: string },
>(
  ...sources: Entity[][]
): Record<string | number, Entity> => {
  return zipEntities({}, sources.flat());
};

export const zipEntities = <
  Entity extends { id: string | number; updated_at: string },
>(
  map: Record<string | number, Entity>,
  entities: Entity[],
): Record<string | number, Entity> => {
  const result: Record<string | number, Entity> = { ...map };

  for (const entity of entities) {
    const existing = result[entity.id];
    const isNew = !existing;
    const isMoreRecent =
      existing && dayjs(entity.updated_at).isAfter(existing.updated_at);

    if (isNew || isMoreRecent) {
      result[entity.id] = entity;
    }
  }

  return result;
};

export const zip = <E extends Entity>(
  ...entityEntries: EntityEntries<E>[][]
): Record<string | number, E> => {
  // oldest first, newest last
  const sortedEntityEntries = entityEntries.flat().sort((entry1, entry2) => {
    if (isNullOrUndefined(entry1.fulfilledTimeStamp)) {
      return -1;
    }

    if (isNullOrUndefined(entry2.fulfilledTimeStamp)) {
      return 1;
    }

    return entry1.fulfilledTimeStamp - entry2.fulfilledTimeStamp;
  });

  const entities = sortedEntityEntries.flatMap(entries => entries.entities);
  const map: Record<string | number, E> = {};

  for (const entity of entities) {
    // Do what mergeEntities does in the entity framework.
    // Different endpoints may return different sets of attributes for the same entity.
    map[entity.id] = {
      ...map[entity.id],
      ...entity,
    };
  }

  return map;
};
