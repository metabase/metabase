import Question from "metabase-lib/lib/Question";
import { ExpressionDimension } from "metabase-lib/lib/Dimension";

import { isActionButtonCard } from "metabase/writeback/utils";

import {
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  variableFilterForParameter,
} from "./filters";

import { tag_names } from "cljs/metabase.shared.parameters.parameters";

function buildStructuredQuerySectionOptions(section) {
  return section.items.map(({ dimension }) => ({
    sectionName: section.name,
    name: dimension.displayName(),
    icon: dimension.icon(),
    target: ["dimension", dimension.mbql()],
    // these methods don't exist on instances of ExpressionDimension
    isForeign: !!(dimension instanceof ExpressionDimension
      ? false
      : dimension.fk() || dimension.joinAlias()),
  }));
}

function buildNativeQuerySectionOptions(section) {
  return section.items.map(({ dimension }) => ({
    name: dimension.displayName(),
    icon: dimension.icon(),
    isForeign: false,
    target: ["dimension", dimension.mbql()],
  }));
}

function buildVariableOption(variable) {
  return {
    name: variable.displayName(),
    icon: variable.icon(),
    isForeign: false,
    target: ["variable", variable.mbql()],
  };
}

function buildTextTagOption(tagName) {
  return {
    name: tagName,
    icon: "string",
    isForeign: false,
    target: ["text-tag", tagName],
  };
}

export function getParameterMappingOptions(
  metadata,
  parameter = null,
  card,
  dashcard = null,
) {
  if (dashcard && card.display === "text") {
    const tagNames = tag_names(dashcard.visualization_settings.text || "");
    return tagNames ? tagNames.map(buildTextTagOption) : [];
  }

  if (isActionButtonCard(card)) {
    // action cards don't have parameters
    return [];
  }

  if (!card.dataset_query) {
    return [];
  }

  const question = new Question(card, metadata);
  const query = question.query();
  const options = [];

  if (question.isStructured()) {
    options.push(
      ...query
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section => buildStructuredQuerySectionOptions(section)),
    );
  } else {
    options.push(
      ...query
        .variables(
          parameter ? variableFilterForParameter(parameter) : undefined,
        )
        .map(buildVariableOption),
    );
    options.push(
      ...query
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
          parameter ? getTagOperatorFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section => buildNativeQuerySectionOptions(section)),
    );
  }

  return options;
}
