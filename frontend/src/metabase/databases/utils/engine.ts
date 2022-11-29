import { Engine } from "metabase-types/api";
import { EngineOption } from "../types";

const ELEVATED_ENGINES = [
  "mysql",
  "postgres",
  "sqlserver",
  "redshift",
  "bigquery-cloud-sdk",
  "snowflake",
];

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
  const path = `app/assets/img/drivers`;

  switch (engine) {
    case "bigquery":
    case "druid":
    case "googleanalytics":
    case "h2":
    case "mongo":
    case "mysql":
    case "oracle":
    case "postgres":
    case "presto":
    case "redshift":
    case "snowflake":
    case "sparksql":
    case "starburst":
    case "sqlite":
    case "sqlserver":
    case "vertica":
      return `${path}/${engine}.svg`;
    case "bigquery-cloud-sdk":
      return `${path}/bigquery.svg`;
    case "presto-jdbc":
      return `${path}/presto.svg`;
  }
};
