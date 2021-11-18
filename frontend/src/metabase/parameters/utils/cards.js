import Question from "metabase-lib/lib/Question";

import { areFieldFilterOperatorsEnabled } from "./feature-flag";
import { getParameterTargetField } from "metabase/parameters/utils/targets";
import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";

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
