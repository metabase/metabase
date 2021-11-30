import _ from "underscore";
import { updateIn } from "icepick";

import { normalizeParameterValue } from "metabase/parameters/utils/parameter-values";
import {
  getParametersMappedToCard,
  remapParameterValuesForTemplateTags,
} from "metabase/parameters/utils/cards";

import * as Q_DEPRECATED from "metabase/lib/query"; // legacy
import Utils from "metabase/lib/utils";

import Question from "../../metabase-lib/lib/Question";

// TODO Atte Keinänen 6/5/17 Should these be moved to corresponding metabase-lib classes?
// Is there any reason behind keeping them in a central place?

export const STRUCTURED_QUERY_TEMPLATE = {
  type: "query",
  database: null,
  query: {
    "source-table": null,
    aggregation: undefined,
    breakout: undefined,
    filter: undefined,
  },
};

export const NATIVE_QUERY_TEMPLATE = {
  type: "native",
  database: null,
  native: {
    query: "",
    "template-tags": {},
  },
};

export function isStructured(card) {
  return card.dataset_query.type === "query";
}

export function isNative(card) {
  return card.dataset_query.type === "native";
}

export function cardVisualizationIsEquivalent(cardA, cardB) {
  return _.isEqual(
    _.pick(cardA, "display", "visualization_settings"),
    _.pick(cardB, "display", "visualization_settings"),
  );
}

export function cardQueryIsEquivalent(cardA, cardB) {
  cardA = updateIn(cardA, ["dataset_query", "parameters"], p => p || []);
  cardB = updateIn(cardB, ["dataset_query", "parameters"], p => p || []);
  return _.isEqual(
    _.pick(cardA, "dataset_query"),
    _.pick(cardB, "dataset_query"),
  );
}

export function cardIsEquivalent(
  cardA,
  cardB,
  { checkParameters = false } = {},
) {
  return (
    cardQueryIsEquivalent(cardA, cardB) &&
    cardVisualizationIsEquivalent(cardA, cardB) &&
    (!checkParameters ||
      _.isEqual(cardA.parameters || [], cardB.parameters || []))
  );
}

export function getQuery(card) {
  if (card.dataset_query.type === "query") {
    return card.dataset_query.query;
  } else {
    return null;
  }
}

export function getTableMetadata(card, metadata) {
  const query = getQuery(card);
  if (query && query["source-table"] != null) {
    return metadata.table(query["source-table"]) || null;
  }
  return null;
}

// NOTE Atte Keinänen 7/5/17: Still used in dashboards and public questions.
// Query builder uses `Question.getResults` which contains similar logic.
export function applyParameters(
  card,
  parameters,
  parameterValues = {},
  parameterMappings = [],
) {
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

export function isTransientId(id) {
  return id != null && typeof id === "string" && isNaN(parseInt(id));
}

export function questionUrlWithParameters(
  card,
  metadata,
  parameters,
  parameterValues,
  dashcard,
) {
  const parameterMappings = dashcard?.parameter_mappings;
  const dashboardId = dashcard?.dashboard_id;
  const dashboardParametersMappedToCard = getParametersMappedToCard(
    card,
    parameters,
    parameterMappings,
  );

  const question = new Question(card, metadata);
  if (question.isStructured()) {
    return (
      question
        // when a user doesn't have data perms, we run the card like it is in a dashboard
        .setDashboardId(question.query().isEditable() ? undefined : dashboardId)
        // set the parameters on the card so that the query builder knows to show them
        .setParameters(dashboardParametersMappedToCard)
        .setParameterValues(parameterValues)
        .getUrlWithParameters()
    );
  } else if (question.isNative()) {
    // for native questions, dashboard parameters are mapped explicitly to template tags
    // defined in the native query, so instead of passing dashboard parameters to the qb,
    // we just need to convert the keys in the parameterValues map from dashboard parameters slugs
    // to the names of the template tags.
    const templateTagParameters = question.parameters();
    const parameterValuesByTemplateTag = remapParameterValuesForTemplateTags(
      dashboardParametersMappedToCard,
      templateTagParameters,
      parameterValues,
    );

    return question
      .setParameterValues(parameterValuesByTemplateTag)
      .getUrlWithParameters();
  }
}
