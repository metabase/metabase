import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import _ from "underscore";

import * as Lib from "metabase-lib";
import { FieldDimension } from "metabase-lib/v1/Dimension";
import {
  deriveFieldOperatorFromParameter,
  getParameterOperatorName,
} from "metabase-lib/v1/parameters/utils/operators";
import {
  getParameterSubType,
  isDateParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  setStartingFrom,
  EXCLUDE_OPTIONS,
  EXCLUDE_UNITS,
} from "metabase-lib/v1/queries/utils/query-time";
import { isTemplateTagReference } from "metabase-lib/v1/references";
import { isDimensionTarget } from "metabase-types/guards";

const withTemporalUnit = (fieldRef, unit) => {
  const dimension =
    (fieldRef && FieldDimension.parseMBQLOrWarn(fieldRef)) ||
    new FieldDimension(null);

  return dimension.withTemporalUnit(unit).mbql();
};

const timeParameterValueDeserializers = [
  {
    testRegex: /^exclude-(days|months|quarters|hours)-([a-zA-Z0-9\-]+)$/,
    deserialize: (matches, fieldRef) => {
      const unit = EXCLUDE_UNITS[matches[0]];
      const options = EXCLUDE_OPTIONS[unit]().flat();
      const values = matches[1].split("-");
      return [
        "!=",
        withTemporalUnit(fieldRef, unit),
        ...options
          .filter(
            ({ serialized }) => !!_.find(values, value => value === serialized),
          )
          .map(({ value }) => value),
      ];
    },
  },
  {
    testRegex: /^past([0-9]+)([a-z]+)s-from-([0-9]+)([a-z]+)s$/,
    deserialize: (matches, fieldRef) => {
      const base = [
        "time-interval",
        fieldRef,
        -parseInt(matches[0]),
        matches[1],
      ];
      return setStartingFrom(base, parseInt(matches[2]), matches[3]);
    },
  },
  {
    testRegex: /^past([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, -parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s-from-([0-9]+)([a-z]+)s$/,
    deserialize: (matches, fieldRef) => {
      const base = [
        "time-interval",
        fieldRef,
        parseInt(matches[0]),
        matches[1],
      ];
      return setStartingFrom(base, -parseInt(matches[2]), matches[3]);
    },
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^this([a-z]+)$/,
    deserialize: (matches, fieldRef) => [
      "time-interval",
      fieldRef,
      "current",
      matches[0],
    ],
  },
  {
    testRegex: /^~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["<", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~$/,
    deserialize: (matches, fieldRef) => [">", fieldRef, matches[0]],
  },
  {
    testRegex: /^(\d{4}-\d{2})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "month"),
      moment(matches[0], "YYYY-MM").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^(Q\d-\d{4})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "quarter"),
      moment(matches[0], "[Q]Q-YYYY").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["=", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => [
      "between",
      fieldRef,
      matches[0],
      matches[1],
    ],
  },
];

export function dateParameterValueToMBQL(parameterValue, fieldRef) {
  const deserializer = timeParameterValueDeserializers.find(des =>
    des.testRegex.test(parameterValue),
  );

  if (deserializer) {
    const substringMatches = deserializer.testRegex
      .exec(parameterValue)
      .splice(1);
    return deserializer.deserialize(substringMatches, fieldRef);
  } else {
    return null;
  }
}

export function stringParameterValueToMBQL(parameter, fieldRef) {
  const parameterValue = Array.isArray(parameter.value)
    ? parameter.value
    : [parameter.value];
  const operator = deriveFieldOperatorFromParameter(parameter);
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);
  const operatorOptions = operator?.optionsDefaults;
  const hasMultipleValues = parameterValue.length > 1;

  return [operatorName]
    .concat(hasMultipleValues && operatorOptions ? operatorOptions : [])
    .concat([fieldRef])
    .concat(parameterValue)
    .concat(!hasMultipleValues && operatorOptions ? operatorOptions : []);
}

export function numberParameterValueToMBQL(parameter, fieldRef) {
  const parameterValue = parameter.value;
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(
    [].concat(parameterValue).map(value => {
      const number = parseFloat(value);
      return isNaN(number) ? null : number;
    }),
  );
}

function isFieldFilterParameterConveratableToMBQL(parameter) {
  const { value, target } = parameter;
  const hasValue = value != null;
  const hasWellFormedTarget = Array.isArray(target?.[1]);
  const hasFieldDimensionTarget =
    isDimensionTarget(target) && !isTemplateTagReference(target[1]);

  return hasValue && hasWellFormedTarget && hasFieldDimensionTarget;
}

/** compiles a parameter with value to MBQL */
function fieldFilterParameterToMBQL(query, stageIndex, parameter) {
  if (!isFieldFilterParameterConveratableToMBQL(parameter)) {
    return null;
  }

  const columns = Lib.filterableColumns(query, stageIndex);
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [parameter.target[1]],
  );
  if (columnIndex < 0) {
    return null;
  }

  const column = columns[columnIndex];
  const fieldRef = Lib.legacyRef(query, stageIndex, column);

  if (isDateParameter(parameter)) {
    return dateParameterValueToMBQL(parameter.value, fieldRef);
  } else if (Lib.isNumeric(column)) {
    return numberParameterValueToMBQL(parameter, fieldRef);
  } else {
    return stringParameterValueToMBQL(parameter, fieldRef);
  }
}

export function fieldFilterParameterToFilter(query, stageIndex, parameter) {
  const mbql = fieldFilterParameterToMBQL(query, stageIndex, parameter);
  if (mbql) {
    return Lib.expressionClauseForLegacyExpression(query, stageIndex, mbql);
  } else {
    return null;
  }
}
