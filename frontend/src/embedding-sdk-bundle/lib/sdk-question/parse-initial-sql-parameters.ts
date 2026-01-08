import type { SqlParameterValues } from "embedding-sdk-bundle/types";
import type { Card, DatasetQuery } from "metabase-types/api";

interface Opts {
  initialSqlParameters: SqlParameterValues | undefined;
  card: Card<DatasetQuery>;
}

export function parseInitialSqlParameters(opts: Opts): {
  [x: string]: string | string[];
} {
  const { initialSqlParameters, card } = opts;

  if (!initialSqlParameters) {
    return {};
  }

  const { parameters = [] } = card;

  return Object.fromEntries(
    Object.entries(initialSqlParameters).map(([key, value]) => {
      const parameter = parameters.find((p) => p.slug === key);

      if (parameter && parameter.isMultiSelect) {
        if (Array.isArray(value)) {
          return [key, value.map(String)];
        }
      }

      return [key, String(value)];
    }),
  );
}
