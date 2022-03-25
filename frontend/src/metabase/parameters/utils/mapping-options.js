import _ from "underscore";

import Question from "metabase-lib/lib/Question";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";

import {
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  variableFilterForParameter,
} from "./filters";

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

export function getParameterMappingOptions(metadata, parameter = null, card) {
  const options = [];
  if (card.display === "text") {
    // text cards don't have parameters
    return [];
  }

  const question = new Question(card, metadata);
  const query = question.query();

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

export function retrieveMappingOption(field, mappingOptions) {
  if (field) {
    const [targetFieldType, targetFieldRef] = field;
    return _.find(mappingOptions, mappingOption => {
      const mappingField = mappingOption.target;
      const [mappingFieldType, mappingFieldRef] = mappingField;

      // field reference might be the same but not have the same Array.length, i.e.:
      // ["dimension", "Custom column", null] OR ["dimension", "Custom column"]
      if (targetFieldRef.length !== mappingFieldRef.length) {
        const updatedMappingFieldRef = mappingFieldRef.slice(0, 2);
        const updatedMappingField = [mappingFieldType, updatedMappingFieldRef];
        const updatedFieldRef = targetFieldRef.slice(0, 2);
        const updatedField = [targetFieldType, updatedFieldRef];
        return _.isEqual(updatedMappingField, updatedField);
      }

      // fallback
      return _.isEqual(mappingField, field);
    });
  }

  return undefined;
}
