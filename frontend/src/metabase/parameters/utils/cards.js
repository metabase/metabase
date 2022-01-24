import _ from "underscore";

import Question from "metabase-lib/lib/Question";

import {
  getParameterTargetField,
  getTemplateTagFromTarget,
} from "metabase/parameters/utils/targets";
import {
  getValuePopulatedParameters,
  hasParameterValue,
} from "metabase/parameters/utils/parameter-values";

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags) {
  function getTemplateTagType(tag) {
    const { type } = tag;
    if (type === "date") {
      return "date/single";
    } else if (type === "string") {
      return "string/=";
    } else if (type === "number") {
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
  if (!card) {
    return [];
  }

  const parameters = getParametersFromCard(card);
  const valuePopulatedParameters = getValuePopulatedParameters(
    parameters,
    parameterValues,
  );
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map(parameter => {
    const field = getParameterTargetField(parameter.target, metadata, question);
    return {
      ...parameter,
      fields: field == null ? [] : [field],
      field_id: field?.id,
      hasOnlyFieldTargets: field != null,
    };
  });
}

// when navigating from dashboard --> saved native question,
// we are given dashboard parameters and a map of dashboard parameter ids to parameter values
// we need to transform this into a map of template tag ids to parameter values
// so that we popoulate the template tags in the native editor
export function remapParameterValuesToTemplateTags(
  templateTags,
  dashboardParameters,
  parameterValuesByDashboardParameterId,
) {
  const parameterValues = {};
  const templateTagParametersByName = _.indexBy(templateTags, "name");

  dashboardParameters.forEach(dashboardParameter => {
    const { target } = dashboardParameter;
    const tag = getTemplateTagFromTarget(target);

    if (templateTagParametersByName[tag]) {
      const templateTagParameter = templateTagParametersByName[tag];
      const parameterValue =
        parameterValuesByDashboardParameterId[dashboardParameter.id];
      if (hasParameterValue(parameterValue)) {
        parameterValues[templateTagParameter.name] = parameterValue;
      }
    }
  });

  return parameterValues;
}
