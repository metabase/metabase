import _ from "underscore";

import {
  Card,
  Parameter,
  ParameterValuesConfig,
  ParameterTarget,
  TemplateTag,
} from "metabase-types/api";
import type { ParameterWithTarget } from "metabase-lib/parameters/types";
import { getTemplateTagFromTarget } from "metabase-lib/parameters/utils/targets";
import { hasParameterValue } from "metabase-lib/parameters/utils/parameter-values";

function getTemplateTagType(tag: TemplateTag) {
  const { type } = tag;
  if (type === "date") {
    return "date/single";
    // @ts-expect-error -- preserving preexisting incorrect types (for now)
  } else if (type === "string") {
    return "string/=";
  } else if (type === "number") {
    return "number/=";
  } else {
    return "category";
  }
}

function getTemplateTagParameterTarget(tag: TemplateTag): ParameterTarget {
  return tag.type === "dimension"
    ? ["dimension", ["template-tag", tag.name]]
    : ["variable", ["template-tag", tag.name]];
}

export function getTemplateTagParameter(
  tag: TemplateTag,
  config?: ParameterValuesConfig,
): ParameterWithTarget {
  return {
    id: tag.id,
    type: tag["widget-type"] || getTemplateTagType(tag),
    target: getTemplateTagParameterTarget(tag),
    name: tag["display-name"],
    slug: tag.name,
    default: tag.default,
    options: tag.options,
    values_query_type: config?.values_query_type,
    values_source_type: config?.values_source_type,
    values_source_config: config?.values_source_config,
  };
}

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(
  tags: TemplateTag[],
  parameters: Parameter[] = [],
): ParameterWithTarget[] {
  const parametersById = _.indexBy(parameters, "id");

  return tags
    .filter(
      tag =>
        tag.type != null &&
        ((tag["widget-type"] && tag["widget-type"] !== "none") ||
          tag.type !== "dimension"),
    )
    .map(tag => getTemplateTagParameter(tag, parametersById[tag.id]));
}

export function getTemplateTagsForParameters(card: Card) {
  const templateTags: TemplateTag[] =
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

export function getParametersFromCard(
  card: Card,
): Parameter[] | ParameterWithTarget[] {
  if (!card) {
    return [];
  }

  if (card.parameters && !_.isEmpty(card.parameters)) {
    return card.parameters;
  } else {
    return getTemplateTagParametersFromCard(card);
  }
}

export function getTemplateTagParametersFromCard(card: Card) {
  const tags = getTemplateTagsForParameters(card);
  return getTemplateTagParameters(tags, card.parameters);
}

// when navigating from dashboard --> saved native question,
// we are given dashboard parameters and a map of dashboard parameter ids to parameter values
// we need to transform this into a map of template tag ids to parameter values
// so that we popoulate the template tags in the native editor
export function remapParameterValuesToTemplateTags(
  templateTags: TemplateTag[],
  dashboardParameters: ParameterWithTarget[],
  parameterValuesByDashboardParameterId: {
    [key: string]: any;
  },
) {
  const parameterValues: {
    [key: string]: any;
  } = {};
  const templateTagParametersByName = _.indexBy(templateTags, "name");

  dashboardParameters.forEach(dashboardParameter => {
    const { target } = dashboardParameter;
    const tag = getTemplateTagFromTarget(target);

    if (tag != null && templateTagParametersByName[tag]) {
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
