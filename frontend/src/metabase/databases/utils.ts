import { Engine } from "metabase-types/api";

export const getDetailFields = (
  engine: string | null,
  engines: Record<string, Engine>,
) => {
  if (engine) {
    return engines[engine]["details-fields"];
  } else {
    return [];
  }
};
