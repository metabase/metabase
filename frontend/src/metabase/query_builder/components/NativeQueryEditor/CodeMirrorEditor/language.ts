import { json } from "@codemirror/lang-json";
import {
  MySQL,
  PLSQL,
  PostgreSQL,
  StandardSQL,
  sql,
} from "@codemirror/lang-sql";
import type { LanguageSupport } from "@codemirror/language";

type Dialect = {
  spec: {
    keywords?: string;
  };
  dialect?: {
    words?: Record<string, any>;
  };
};

type Source = {
  dialect?: Dialect;
  language: LanguageSupport;
};

const engineToDialect = {
  "bigquery-cloud-sdk": StandardSQL,
  mysql: MySQL,
  oracle: PLSQL,
  postgres: PostgreSQL,
  // TODO:
  // "presto-jdbc": "trino",
  // redshift: "redshift",
  // snowflake: "snowflake",
  // sparksql: "spark",
  // h2: "h2",
};

const MongoDialect: Dialect = {
  spec: {
    keywords: "$set $sample",
  },
};

export function source(engine?: string | null): Source {
  // TODO: this should be provided by the engine driver through the API
  switch (engine) {
    case "mongo":
      return {
        dialect: MongoDialect,
        language: json(),
      };

    case "druid":
      return {
        language: json(),
      };

    case "bigquery-cloud-sdk":
    case "mysql":
    case "oracle":
    case "postgres":
    case "presto-jdbc":
    case "redshift":
    case "snowflake":
    case "sparksql":
    case "h2":
    default: {
      const dialect =
        engineToDialect[engine as keyof typeof engineToDialect] ?? StandardSQL;
      return {
        dialect,
        language: sql({
          dialect,
          upperCaseKeywords: true,
        }),
      };
    }
  }
}

type LanguageOptions = {
  engine?: string | null;
};

export function language({ engine }: LanguageOptions) {
  const { language } = source(engine);
  if (!language) {
    return [];
  }

  return language;
}
