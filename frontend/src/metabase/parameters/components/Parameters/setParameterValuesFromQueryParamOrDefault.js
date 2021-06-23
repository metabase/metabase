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

  if (setParameterValue) {
    const parameterValues = {};
    for (const parameter of parameters) {
      const queryParam = query && query[parameter.slug];
      if (queryParam != null || parameter.default != null) {
        let value = queryParam != null ? queryParam : parameter.default;

        // ParameterValueWidget uses FieldValuesWidget if there's no available
        // date widget and all targets are fields. This matches that logic.
        const willUseFieldValuesWidget =
          parameter.hasOnlyFieldTargets && !/^date\//.test(parameter.type);

        if (willUseFieldValuesWidget && value && !Array.isArray(value)) {
          // FieldValuesWidget always produces an array. If we'll use that
          // widget, we should start with an array to match.
          value = [value];
        }

        // field IDs can be either ["field", <integer-id>, <options>] or ["field", <string-name>, <options>]
        const fieldIds = parameter.field_ids || [];
        const fields = fieldIds.map(
          id => metadata.field(id) || Dimension.parseMBQL(id, metadata).field(),
        );
        parameterValues[parameter.id] = parseQueryParam(value, fields);
      }
      setParameterValue(parameterValues);
    }
  }
};

const setForInternalQuestion = props => {
  // sync parameters from URL query string
  const { parameters, setParameterValue, query, metadata } = props;
  if (setParameterValue) {
    for (const parameter of parameters) {
      const queryParam = query && query[parameter.slug];
      if (queryParam != null || parameter.default != null) {
        let value = queryParam != null ? queryParam : parameter.default;

        // ParameterValueWidget uses FieldValuesWidget if there's no available
        // date widget and all targets are fields. This matches that logic.
        const willUseFieldValuesWidget =
          parameter.hasOnlyFieldTargets && !/^date\//.test(parameter.type);
        if (willUseFieldValuesWidget && value && !Array.isArray(value)) {
          // FieldValuesWidget always produces an array. If we'll use that
          // widget, we should start with an array to match.
          value = [value];
        }
        // field IDs can be either ["field", <integer-id>, <options>] or ["field", <string-name>, <options>]
        const fieldIds = parameter.field_ids || [];
        const fields = fieldIds.map(
          id => metadata.field(id) || Dimension.parseMBQL(id, metadata).field(),
        );
        setParameterValue(parameter.id, parseQueryParam(value, fields));
      }
    }
  }
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
