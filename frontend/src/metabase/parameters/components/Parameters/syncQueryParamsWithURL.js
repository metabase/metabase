import Dimension from "metabase-lib/lib/Dimension";
import {
  getParameterValueFromQueryParams,
  getParameterValuePairsFromQueryParams,
  hasParameterValue,
} from "metabase/meta/Parameter";

export const syncQueryParamsWithURL = props => {
  props.commitImmediately
    ? syncForInternalQuestion(props)
    : syncForPublicQuestion(props);
};

const syncForInternalQuestion = props => {
  const { parameters, setParameterValue, query, metadata } = props;

  if (!setParameterValue) {
    return;
  }

  parameters.forEach(parameter => {
    const parameterValue = getParameterValueFromQueryParams(parameter, query);

    if (hasParameterValue(parameterValue)) {
      const parsedParameterValue = parseQueryParams(
        parameterValue,
        parameter,
        metadata,
      );
      setParameterValue(parameter.id, parsedParameterValue);
    }
  });
};

const syncForPublicQuestion = props => {
  const { parameters, setMultipleParameterValues, query, metadata } = props;

  if (!setMultipleParameterValues) {
    return;
  }

  const parameterIdValuePairs = getParameterValuePairsFromQueryParams(
    parameters,
    query,
  ).map(([parameter, value]) => [
    parameter.id,
    parseQueryParams(value, parameter, metadata),
  ]);

  const parameterValuesById = Object.fromEntries(parameterIdValuePairs);

  setMultipleParameterValues(parameterValuesById);
};

const parseQueryParams = (queryParam, parameter, metadata) => {
  const value = getValue(queryParam, parameter);
  const fields = getFields(parameter, metadata);

  return getValueFromFields(value, fields);
};

const getValue = (queryParam, parameter) => {
  const value = queryParam != null ? queryParam : parameter.default;
  return treatValueForFieldValuesWidget(value, parameter);
};

const treatValueForFieldValuesWidget = (value, parameter) => {
  // ParameterValueWidget uses FieldValuesWidget if there's no available
  // date widget and all targets are fields.
  const willUseFieldValuesWidget =
    parameter.hasOnlyFieldTargets && !/^date\//.test(parameter.type);

  // If we'll use FieldValuesWidget, we should start with an array to match.
  if (willUseFieldValuesWidget && !Array.isArray(value)) {
    value = [value];
  }

  return value;
};

// field IDs can be either
// ["field", <integer-id>, <options>] or
// ["field", <string-name>, <options>]
const getFields = (parameter, metadata) => {
  const fieldIds = parameter.field_ids || [];
  return fieldIds.map(
    id => metadata.field(id) || Dimension.parseMBQL(id, metadata).field(),
  );
};

export const getValueFromFields = (value, fields) => {
  if (Array.isArray(value)) {
    return value.map(v => getValueFromFields(v, fields));
  }

  // [].every is always true, so only check if there are some fields
  if (fields.length > 0) {
    // unix dates fields are numeric but query params shouldn't be parsed as numbers
    if (fields.every(f => f.isNumeric() && !f.isDate())) {
      return parseFloat(value);
    }

    if (fields.every(f => f.isBoolean())) {
      return value === "true" ? true : value === "false" ? false : value;
    }
  }

  return value;
};
