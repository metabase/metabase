import dayjs from "dayjs";

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
