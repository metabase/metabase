import type { Engine } from "metabase-types/api";

import { ELEVATED_ENGINES, ENGINE_LOGO } from "../constants";
import type { EngineOption } from "../types";

export const getEngineOptions = (
  engines: Record<string, Engine>,
  selectedKey?: string,
  isAdvanced?: boolean,
): EngineOption[] => {
  const options = Object.entries(engines)
    .filter(([key, engine]) => isEngineVisible(key, engine, selectedKey))
    .map(([key, engine]) => getEngineOption(key, engine))
    .sort((a, b) => a.name.localeCompare(b.name));

  return isAdvanced ? options : options.sort((a, b) => a.index - b.index);
};

const isEngineVisible = (
  engineKey: string,
  engine: Engine,
  selectedEngineKey?: string,
) => {
  const isSelected = engineKey === selectedEngineKey;
  const isSuperseded = engine["superseded-by"] != null;
  const isSuperseding = engine["superseded-by"] === selectedEngineKey;

  return isSelected || !isSuperseded || isSuperseding;
};

const getEngineOption = (engineKey: string, engine: Engine) => {
  const index = ELEVATED_ENGINES.indexOf(engineKey);

  return {
    name: engine["driver-name"],
    value: engineKey,
    index: index >= 0 ? index : ELEVATED_ENGINES.length,
  };
};

export const getEngineLogo = (engine: string): string | undefined => {
  const logo = ENGINE_LOGO[engine];
  return logo ? `app/assets/img/drivers/${logo}` : undefined;
};

export const getDefaultEngineKey = (engines: Record<string, Engine>) => {
  return engines["postgres"] ? "postgres" : Object.keys(engines)[0];
};

export function getEngineNativeType(engine?: string): "sql" | "json" {
  switch (engine) {
    case "mongo":
    case "druid":
      return "json";
    default:
      return "sql";
  }
}

export function getNativeQueryLanguage(engine?: string) {
  return getEngineNativeType(engine).toUpperCase() as "SQL" | "JSON";
}

type JSONQuery = Record<string, any> | Record<string, any>[];

function formatJsonQuery(query: JSONQuery) {
  return JSON.stringify(query, null, 2);
}

export function formatNativeQuery(query: string | JSONQuery): string {
  return typeof query === "string" ? query : formatJsonQuery(query);
}

export function isDeprecatedEngine(
  engines: Record<string, Engine> = {},
  engine: string,
) {
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}
