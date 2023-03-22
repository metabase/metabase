import moment from "moment-timezone";
import _ from "underscore";

import { isDimensionTarget } from "metabase-types/guards";
import {
  setStartingFrom,
  EXCLUDE_OPTIONS,
  EXCLUDE_UNITS,
} from "metabase-lib/queries/utils/query-time";
import Dimension, { FieldDimension } from "metabase-lib/Dimension";
import {
  getParameterSubType,
  isDateParameter,
} from "metabase-lib/parameters/utils/parameter-type";
import { isTemplateTagReference } from "metabase-lib/references";
import {
  deriveFieldOperatorFromParameter,
  getParameterOperatorName,
} from "metabase-lib/parameters/utils/operators";
import { hasParameterValue } from "metabase-lib/parameters/utils/parameter-values";

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
  const parameterValue = parameter.value;
  const operator = deriveFieldOperatorFromParameter(parameter);
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef]
    .concat(parameterValue)
    .concat(operator?.optionsDefaults ?? []);
}

export function numberParameterValueToMBQL(parameter, fieldRef) {
  const parameterValue = parameter.value;
  const subtype = getParameterSubType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(
    [].concat(parameterValue).map(v => parseFloat(v)),
  );
}

function isFieldFilterParameterConveratableToMBQL(parameter) {
  const { value, target } = parameter;
  const hasValue = hasParameterValue(value);
  const hasWellFormedTarget = Array.isArray(target?.[1]);
  const hasFieldDimensionTarget =
    isDimensionTarget(target) && !isTemplateTagReference(target[1]);

  return hasValue && hasWellFormedTarget && hasFieldDimensionTarget;
}

/** compiles a parameter with value to an MBQL clause */
export function fieldFilterParameterToMBQLFilter(parameter, metadata) {
  if (!isFieldFilterParameterConveratableToMBQL(parameter)) {
    return null;
  }

  const dimension = Dimension.parseMBQL(parameter.target[1], metadata);
  const field = dimension.field();
  const fieldRef = dimension.mbql();

  if (isDateParameter(parameter)) {
    return dateParameterValueToMBQL(parameter.value, fieldRef);
  } else if (field.isNumeric()) {
    return numberParameterValueToMBQL(parameter, fieldRef);
  } else {
    return stringParameterValueToMBQL(parameter, fieldRef);
  }
}
