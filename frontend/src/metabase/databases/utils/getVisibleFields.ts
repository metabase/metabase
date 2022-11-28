import { Engine } from "metabase-types/api";

export const getVisibleFields = (engine: Engine) => {
  return engine["details-fields"] ?? [];
};
