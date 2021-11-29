import _ from "underscore";
import { assoc, updateIn } from "icepick";

import { getParametersFromCard } from "metabase/parameters/utils/cards";
import { parameterToMBQLFilter } from "metabase/parameters/utils/mbql";
import { normalizeParameterValue } from "metabase/parameters/utils/parameter-values";

import * as Query from "metabase/lib/query/query";
import * as Q_DEPRECATED from "metabase/lib/query"; // legacy
import Utils from "metabase/lib/utils";
import * as Urls from "metabase/lib/urls";

import type { StructuredQuery } from "metabase-types/types/Query";
import type {
  Card,
  DatasetQuery,
  StructuredDatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/types/Card";
import type {
  Parameter,
  ParameterMapping,
  ParameterValues,
} from "metabase-types/types/Parameter";
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

// NOTE Atte Keinänen 7/5/17: Still used in dashboards and public questions.
// Query builder uses `Question.getResults` which contains similar logic.
export function applyParameters(
  card: Card,
  parameters: Parameter[],
  parameterValues: ParameterValues = {},
  parameterMappings: ParameterMapping[] = [],
): DatasetQuery {
  const datasetQuery = Utils.copy(card.dataset_query);
  // clean the query
  if (datasetQuery.type === "query") {
    datasetQuery.query = Q_DEPRECATED.cleanQuery(datasetQuery.query);
  }
  datasetQuery.parameters = [];
  for (const parameter of parameters || []) {
    const value = parameterValues[parameter.id];
    if (value == null) {
      continue;
    }

    const cardId = card.id || card.original_card_id;
    const mapping = _.findWhere(
      parameterMappings,
      cardId != null
        ? {
            card_id: cardId,
            parameter_id: parameter.id,
          }
        : // NOTE: this supports transient dashboards where cards don't have ids
          // BUT will not work correctly with multiseries dashcards since
          // there's no way to identify which card the mapping applies to.
          {
            parameter_id: parameter.id,
          },
    );

    const type = parameter.type;
    if (mapping) {
      // mapped target, e.x. on a dashboard
      datasetQuery.parameters.push({
        type,
        value: normalizeParameterValue(type, value),
        target: mapping.target,
        id: parameter.id,
      });
    } else if (parameter.target) {
      // inline target, e.x. on a card
      datasetQuery.parameters.push({
        type,
        value: normalizeParameterValue(type, value),
        target: parameter.target,
        id: parameter.id,
      });
    }
  }

  return datasetQuery;
}

export function isTransientId(id: ?any) {
  return id != null && typeof id === "string" && isNaN(parseInt(id));
}

/** returns a question URL with parameters added to query string or MBQL filters */
export function questionUrlWithParameters(
  card: Card,
  metadata: Metadata,
  parameters: Parameter[],
  parameterValues: ParameterValues = {},
  parameterMappings: ParameterMapping[] = [],
  cardIsDirty: boolean = true,
): DatasetQuery {
  if (!card.dataset_query) {
    return Urls.question(card);
  }

  card = Utils.copy(card);

  const cardParameters = getParametersFromCard(card);
  const datasetQuery = applyParameters(
    card,
    parameters,
    parameterValues,
    parameterMappings,
  );

  // If we have a clean question without parameters applied, don't add the dataset query hash
  if (
    !cardIsDirty &&
    !isTransientId(card.id) &&
    datasetQuery.parameters &&
    datasetQuery.parameters.length === 0
  ) {
    return Urls.question(card);
  }

  const query = {};
  for (const datasetParameter of datasetQuery.parameters || []) {
    const cardParameter = _.find(cardParameters, p =>
      Utils.equals(p.target, datasetParameter.target),
    );
    if (cardParameter) {
      // if the card has a real parameter we can use, use that
      query[cardParameter.slug] = datasetParameter.value;
    } else if (isStructured(card)) {
      // if the card is structured, try converting the parameter to an MBQL filter clause
      const filter = parameterToMBQLFilter(datasetParameter, metadata);
      if (filter) {
        card = updateIn(card, ["dataset_query", "query"], query =>
          Query.addFilter(query, filter),
        );
      } else {
        console.warn("UNHANDLED PARAMETER", datasetParameter);
      }
    } else {
      console.warn("UNHANDLED PARAMETER", datasetParameter);
    }
  }

  if (isTransientId(card.id)) {
    card = assoc(card, "id", null);
  }
  if (isTransientId(card.original_card_id)) {
    card = assoc(card, "original_card_id", null);
  }

  return Urls.question(null, card.dataset_query ? card : undefined, query);
}
