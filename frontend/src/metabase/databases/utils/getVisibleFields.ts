import { Engine } from "metabase-types/api";

export const getVisibleFields = (
  engines: Record<string, Engine>,
  engine = "",
) => {
  return engines[engine]?.["details-fields"] ?? [];
};
