import type { CompletionContext } from "@codemirror/autocomplete";

import { isNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import {
  MBQL_CLAUSES,
  POPULAR_AGGREGATIONS,
  POPULAR_FILTERS,
  POPULAR_FUNCTIONS,
} from "../config";

export type Options = {
  startRule: string;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

import { expressionClauseCompletion, getDatabase } from "./util";

function getPopular(startRule: string) {
  if (startRule === "expression") {
    return POPULAR_FUNCTIONS;
  }
  if (startRule === "boolean") {
    return POPULAR_FILTERS;
  }
  if (startRule === "aggregation") {
    return POPULAR_AGGREGATIONS;
  }
  return null;
}

export function suggestPopular({
  startRule,
  query,
  reportTimezone,
  metadata,
}: Options) {
  const popular = getPopular(startRule);
  if (!popular) {
    return null;
  }

  const database = getDatabase(query, metadata);
  const clauses = popular
    .map(name => MBQL_CLAUSES[name])
    .filter(isNotNull)
    .filter(clause => !database || database?.hasFeature(clause.requiresFeature))
    .map(clause =>
      expressionClauseCompletion(clause, {
        type: startRule,
        database,
        reportTimezone,
      }),
    );

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    if (source !== "") {
      // we only want to show popular functions and suggestions when
      // the source is empty
      return null;
    }
    return {
      from: context.pos,
      options: clauses,
    };
  };
}
