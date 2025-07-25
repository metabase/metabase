import _ from "underscore";

import type { Database } from "metabase-types/api";

const FILTER_DB_KEYS = ["id", "name"];

const FILTER_DB_DETAIL_KEYS = [
  "password",
  "schema-filters-type",
  "schema-filters-patterns",
];

const FILTER_ENGINE_DETAIL_KEYS: Record<string, string[] | undefined> = {
  athena: ["catalog", "s3_staging_dir"],
  bigquery: ["project-id", "service-account-json"],
  databricks: ["catalog"],
  presto: ["catalog"],
  starburst: ["catalog"],
};

export function pickPrefillFieldsFromPrimaryDb(
  primaryDatabase: Database,
): Partial<Database> {
  const { engine } = primaryDatabase;
  const filterEngineDetailKeys = FILTER_ENGINE_DETAIL_KEYS[engine ?? ""] ?? [];
  const filterDetailKeys = [
    ...FILTER_DB_DETAIL_KEYS,
    ...(filterEngineDetailKeys ?? []),
  ];

  return {
    ..._.omit(primaryDatabase, FILTER_DB_KEYS),
    details: {
      ..._.omit(primaryDatabase.details, filterDetailKeys),
      "destination-database": true,
    },
  };
}
