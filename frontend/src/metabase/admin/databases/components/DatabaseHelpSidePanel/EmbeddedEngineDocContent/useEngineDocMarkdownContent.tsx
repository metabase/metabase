import { useEffect, useState } from "react";

import type { EngineKey } from "metabase-types/api";

const ENGINE_DOC_MAPPING: Partial<Record<EngineKey, string>> = {
  athena: "athena",
  "bigquery-cloud-sdk": "bigquery",
  clickhouse: "clickhouse",
  databricks: "databricks",
  "druid-jdbc": "druid",
  druid: "druid",
  mysql: "mysql",
  oracle: "oracle",
  postgres: "postgresql",
  "presto-jdbc": "presto",
  redshift: "redshift",
  snowflake: "snowflake",
  sparksql: "sparksql",
  sqlite: "sqlite",
  sqlserver: "sql-server",
  starburst: "starburst",
  vertica: "vertica",
};

export const useEngineDocMarkdownContent = (engineKey: EngineKey) => {
  const [docMDContent, setDocMDContent] = useState<string>();

  useEffect(() => {
    const docFileName = ENGINE_DOC_MAPPING[engineKey];

    if (!docFileName) {
      setDocMDContent(undefined);
      return;
    }

    import(`docs/databases/connections/${docFileName}.md`)
      .then((result: { default: string }) => {
        setDocMDContent(result.default);
      })
      .catch((err) => {
        console.error(`Failed to load documentation for ${engineKey}:`, err);
        setDocMDContent(undefined);
      });
  }, [engineKey]);

  return docMDContent;
};
