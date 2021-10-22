import _ from "underscore";
import { updateIn } from "icepick";

import type { StructuredQuery } from "metabase-types/types/Query";
import type {
  Card,
  StructuredDatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/types/Card";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type Table from "metabase-lib/lib/metadata/Table";

// TODO Atte Keinänen 6/5/17 Should these be moved to corresponding metabase-lib classes?
// Is there any reason behind keeping them in a central place?

export const STRUCTURED_QUERY_TEMPLATE: StructuredDatasetQuery = {
  type: "query",
  database: null,
  query: {
    "source-table": null,
    aggregation: undefined,
    breakout: undefined,
    filter: undefined,
  },
};

export const NATIVE_QUERY_TEMPLATE: NativeDatasetQuery = {
  type: "native",
  database: null,
  native: {
    query: "",
    "template-tags": {},
  },
};

export function isStructured(card: Card): boolean {
  return card.dataset_query.type === "query";
}

export function isNative(card: Card): boolean {
  return card.dataset_query.type === "native";
}

export function cardVisualizationIsEquivalent(
  cardA: Card,
  cardB: Card,
): boolean {
  return _.isEqual(
    _.pick(cardA, "display", "visualization_settings"),
    _.pick(cardB, "display", "visualization_settings"),
  );
}

export function cardQueryIsEquivalent(cardA: Card, cardB: Card): boolean {
  cardA = updateIn(cardA, ["dataset_query", "parameters"], p => p || []);
  cardB = updateIn(cardB, ["dataset_query", "parameters"], p => p || []);
  return _.isEqual(
    _.pick(cardA, "dataset_query"),
    _.pick(cardB, "dataset_query"),
  );
}

export function cardIsEquivalent(
  cardA: Card,
  cardB: Card,
  { checkParameters = false }: { checkParameters: boolean } = {},
): boolean {
  return (
    cardQueryIsEquivalent(cardA, cardB) &&
    cardVisualizationIsEquivalent(cardA, cardB) &&
    (!checkParameters ||
      _.isEqual(cardA.parameters || [], cardB.parameters || []))
  );
}

export function getQuery(card: Card): ?StructuredQuery {
  if (card.dataset_query.type === "query") {
    return card.dataset_query.query;
  } else {
    return null;
  }
}

export function getTableMetadata(card: Card, metadata: Metadata): ?Table {
  const query = getQuery(card);
  if (query && query["source-table"] != null) {
    return metadata.table(query["source-table"]) || null;
  }
  return null;
}

export function isTransientId(id: ?any) {
  return id != null && typeof id === "string" && isNaN(parseInt(id));
}
