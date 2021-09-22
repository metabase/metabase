import Dimension from "metabase-lib/lib/Dimension";
import {
  getParameterValuesByIdFromQueryParams,
  parseParameterValueForFields,
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
  const parameterValuesById = getParameterValuesByIdFromQueryParams(
    parameters,
    query,
  );

  parameters.forEach(parameter => {
    if (parameter.id in parameterValuesById) {
      const parsedParameterValue = parseQueryParams(
        parameterValuesById[parameter.id],
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

  const parameterValuesById = getParameterValuesByIdFromQueryParams(
    parameters,
    query,
  );

  parameters.forEach(parameter => {
    if (parameter.id in parameterValuesById) {
      const parsedParameterValue = parseQueryParams(
        parameterValuesById[parameter.id],
        parameter,
        metadata,
      );

      parameterValuesById[parameter.id] = parsedParameterValue;
    }
  });

  setMultipleParameterValues(parameterValuesById);
};

const parseQueryParams = (queryParam, parameter, metadata) => {
  const value = getValue(queryParam, parameter);
  const fields = getFields(parameter, metadata);

  return parseParameterValueForFields(value, fields);
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
  const fieldIds =
    parameter.field_ids || [parameter.field_id].filter(f => f != null);

  return fieldIds.map(
    id => metadata.field(id) || Dimension.parseMBQL(id, metadata).field(),
  );
};
