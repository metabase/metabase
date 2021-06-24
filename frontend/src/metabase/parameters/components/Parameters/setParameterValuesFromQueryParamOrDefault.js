import Dimension from "metabase-lib/lib/Dimension";

export const setParameterValuesFromQueryParamOrDefault = props => {
  if (props.commitImmediately) {
    setForInternalQuestion(props);
  } else {
    setForPublicQuestion(props);
  }
};

const setForPublicQuestion = props => {
  const { parameters, setParameterValue, query, metadata } = props;

  if (!setParameterValue) {
    return;
  }

  const parameterValues = {};

  for (const parameter of parameters) {
    const queryParam = query && query[parameter.slug];
    if (queryParam != null || parameter.default != null) {
      const value = getValue(queryParam, parameter);
      const fields = getFields(parameter, metadata);
      const parsedQueryParam = parseQueryParam(value, fields);

      parameterValues[parameter.id] = parsedQueryParam;
    }

    setParameterValue(parameterValues);
  }
};

const setForInternalQuestion = props => {
  const { parameters, setParameterValue, query, metadata } = props;

  if (!setParameterValue) {
    return;
  }

  for (const parameter of parameters) {
    const queryParam = query && query[parameter.slug];

    if (queryParam != null || parameter.default != null) {
      const value = getValue(queryParam, parameter);
      const fields = getFields(parameter, metadata);
      const parsedQueryParam = parseQueryParam(value, fields);

      setParameterValue(parameter.id, parsedQueryParam);
    }
  }
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

const parseQueryParam = (value, fields) => {
  if (Array.isArray(value)) {
    return value.map(v => parseQueryParam(v, fields));
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
