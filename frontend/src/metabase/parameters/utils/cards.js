import _ from "underscore";
import { assoc, updateIn } from "icepick";

import * as Query from "metabase/lib/query/query";
import * as Q_DEPRECATED from "metabase/lib/query"; // legacy
import Utils from "metabase/lib/utils";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/lib/Question";
import { isStructured, isTransientId } from "metabase/meta/Card";

import { areFieldFilterOperatorsEnabled } from "./parameter-type";
import { parameterToMBQLFilter } from "metabase/parameters/utils/mbql";
import { getParameterTargetField } from "metabase/parameters/utils/targets";
import {
  getValuePopulatedParameters,
  normalizeParameterValue,
} from "metabase/parameters/utils/parameter-values";

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags) {
  function getTemplateTagType(tag) {
    const { type } = tag;
    if (type === "date") {
      return "date/single";
    } else if (areFieldFilterOperatorsEnabled() && type === "string") {
      return "string/=";
    } else if (areFieldFilterOperatorsEnabled() && type === "number") {
      return "number/=";
    } else {
      return "category";
    }
  }

  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(tag => {
      return {
        id: tag.id,
        type: tag["widget-type"] || getTemplateTagType(tag),
        target:
          tag.type === "dimension"
            ? ["dimension", ["template-tag", tag.name]]
            : ["variable", ["template-tag", tag.name]],
        name: tag["display-name"],
        slug: tag.name,
        default: tag.default,
      };
    });
}

export function getTemplateTagsForParameters(card) {
  const templateTags =
    card &&
    card.dataset_query &&
    card.dataset_query.type === "native" &&
    card.dataset_query.native["template-tags"]
      ? Object.values(card.dataset_query.native["template-tags"])
      : [];
  return templateTags.filter(
    // this should only return template tags that define a parameter of the card
    tag => tag.type !== "card" && tag.type !== "snippet",
  );
}

export function getParametersFromCard(card) {
  if (card && card.parameters) {
    return card.parameters;
  }

  const tags = getTemplateTagsForParameters(card);
  return getTemplateTagParameters(tags);
}

export function getValueAndFieldIdPopulatedParametersFromCard(
  card,
  metadata,
  parameterValues,
) {
  const parameters = getParametersFromCard(card);
  const valuePopulatedParameters = getValuePopulatedParameters(
    parameters,
    parameterValues,
  );
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map(parameter => {
    // if we have a field id for this parameter, set "field_id"
    const field = getParameterTargetField(parameter.target, metadata, question);
    if (field != null) {
      parameter = assoc(parameter, "fields", [field]);
      parameter = assoc(parameter, "field_id", field.id);
    }
    parameter = assoc(parameter, "hasOnlyFieldTargets", field != null);
    return parameter;
  });
}

// NOTE Atte Keinänen 7/5/17: Still used in dashboards and public questions.
// Query builder uses `Question.getResults` which contains similar logic.
export function applyParameters(
  card,
  parameters,
  parameterValues,
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
      });
    } else if (parameter.target) {
      // inline target, e.x. on a card
      datasetQuery.parameters.push({
        type,
        value: normalizeParameterValue(type, value),
        target: parameter.target,
      });
    }
  }

  return datasetQuery;
}

/** returns a question URL with parameters added to query string or MBQL filters */
export function questionUrlWithParameters(
  card,
  metadata,
  parameters,
  parameterValues = {},
  parameterMappings = [],
  cardIsDirty = true,
) {
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
