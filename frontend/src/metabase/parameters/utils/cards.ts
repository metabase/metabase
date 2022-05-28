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
import { ParameterWithTarget } from "metabase/parameters/types";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";
import { Card } from "metabase-types/types/Card";
import { TemplateTag } from "metabase-types/types/Query";
import Metadata from "metabase-lib/lib/metadata/Metadata";

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

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(
  tags: TemplateTag[],
): ParameterWithTarget[] {
  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(tag => {
      const target: ParameterTarget =
        tag.type === "dimension"
          ? ["dimension", ["template-tag", tag.name]]
          : ["variable", ["template-tag", tag.name]];

      return {
        id: tag.id,
        type: tag["widget-type"] || getTemplateTagType(tag),
        target,
        name: tag["display-name"],
        slug: tag.name,
        default: tag.default,
      };
    });
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

export function getValueAndFieldIdPopulatedParametersFromCard(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any },
  parameters = getParametersFromCard(card),
) {
  if (!card) {
    return [];
  }

  const valuePopulatedParameters: (Parameter[] | ParameterWithTarget[]) & {
    value?: any;
  } = getValuePopulatedParameters(parameters, parameterValues);
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map(parameter => {
    const target:
      | ParameterTarget
      | undefined = (parameter as ParameterWithTarget).target;
    const field = getParameterTargetField(target, metadata, question);
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
