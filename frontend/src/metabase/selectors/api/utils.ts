import dayjs from "dayjs";

export const zipSources = <
  Id extends string | number,
  Entity extends { id: Id; updated_at: string },
>(
  ...sources: Entity[][]
): Partial<Record<Id, Entity>> => {
  const result: Partial<Record<Id, Entity>> = {};
  const entities = sources.flat();

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
