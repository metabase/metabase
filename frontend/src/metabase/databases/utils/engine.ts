import { Engine } from "metabase-types/api";
import { ELEVATED_ENGINES, ENGINES_WITH_LOGO } from "../constants";
import { EngineOption } from "../types";

export const getEngineOptions = (
  engines: Record<string, Engine>,
  engineKey?: string,
): EngineOption[] => {
  return Object.entries(engines)
    .filter(([key, engine]) => key === engineKey || !engine["superseded-by"])
    .map(([key, engine]) => ({
      name: engine["driver-name"],
      value: key,
      index: ELEVATED_ENGINES.indexOf(key),
    }))
    .sort((a, b) => {
      if (a.index >= 0 && b.index >= 0) {
        return a.index - b.index;
      } else if (a.index >= 0) {
        return -1;
      } else if (b.index >= 0) {
        return 1;
      } else {
        return a.name.localeCompare(b.name);
      }
    });
};

export const getEngineLogo = (engine: string): string | undefined => {
  if (ENGINES_WITH_LOGO.includes(engine)) {
    return `app/assets/img/drivers/${engine}.svg`;
  } else {
    return undefined;
  }
};
