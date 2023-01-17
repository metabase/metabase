import _ from "underscore";

import { Parameter } from "metabase-types/api";
import type { ParameterTarget } from "metabase-types/types/Parameter";
import type { Card } from "metabase-types/types/Card";
import type { TemplateTag } from "metabase-types/types/Query";
import type { ParameterWithTarget } from "metabase-lib/parameters/types";
import { getTemplateTagFromTarget } from "metabase-lib/parameters/utils/targets";
import { hasParameterValue } from "metabase-lib/parameters/utils/parameter-values";

export function getTemplateTagType(tag: TemplateTag) {
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

export function getTemplateTagParameterTarget(
  tag: TemplateTag,
): ParameterTarget {
  return tag.type === "dimension"
    ? ["dimension", ["template-tag", tag.name]]
    : ["variable", ["template-tag", tag.name]];
}

export function getTemplateTagParameter(tag: TemplateTag): ParameterWithTarget {
  return {
    id: tag.id,
    type: tag["widget-type"] || getTemplateTagType(tag),
    target: getTemplateTagParameterTarget(tag),
    name: tag["display-name"],
    slug: tag.name,
    default: tag.default,
  };
}

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(
  tags: TemplateTag[],
): ParameterWithTarget[] {
  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(getTemplateTagParameter);
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
  }

  const tags = getTemplateTagsForParameters(card);
  return getTemplateTagParameters(tags);
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
