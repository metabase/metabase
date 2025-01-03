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
  EXCLUDE_OPTIONS,
  EXCLUDE_UNITS,
  setStartingFrom,
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
      const base = ["time-interval", fieldRef, -Number(matches[0]), matches[1]];
      return setStartingFrom(base, Number(matches[2]), matches[3]);
    },
    deserializeMBQL: (matches, fieldRef) => {
      return [
        "relative-time-interval",
        fieldRef,
        -Number(matches[0]),
        matches[1],
        -Number(matches[2]),
        matches[3],
      ];
    },
  },
  {
    testRegex: /^past([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, -Number(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s-from-([0-9]+)([a-z]+)s$/,
    deserialize: (matches, fieldRef) => {
      const base = ["time-interval", fieldRef, Number(matches[0]), matches[1]];
      return setStartingFrom(base, -Number(matches[2]), matches[3]);
    },
    deserializeMBQL: (matches, fieldRef) => {
      return [
        "relative-time-interval",
        fieldRef,
        Number(matches[0]),
        matches[1],
        Number(matches[2]),
        matches[3],
      ];
    },
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      ["time-interval", fieldRef, Number(matches[0]), matches[1]].concat(
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

// legacy `DatePicker` relies on the broken MBQL produced by `deserialize`
// we fix relative date filters with a new `deserializeMBQL` function and
// `isDatePicker` flag
export function dateParameterValueToMBQL(
  parameterValue,
  fieldRef,
  isDatePicker = true,
) {
  const deserializer = timeParameterValueDeserializers.find(des =>
    des.testRegex.test(parameterValue),
  );

  if (deserializer) {
    const substringMatches = deserializer.testRegex
      .exec(parameterValue)
      .splice(1);
    const deserialize = isDatePicker
      ? deserializer.deserialize
      : (deserializer.deserializeMBQL ?? deserializer.deserialize);
    return deserialize(substringMatches, fieldRef);
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
function filterParameterToMBQL(query, stageIndex, parameter) {
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
    return dateParameterValueToMBQL(parameter.value, fieldRef, false);
  } else if (Lib.isNumeric(column)) {
    return numberParameterValueToMBQL(parameter, fieldRef);
  } else {
    return stringParameterValueToMBQL(parameter, fieldRef);
  }
}

export function applyFilterParameter(query, stageIndex, parameter) {
  const mbql = filterParameterToMBQL(query, stageIndex, parameter);
  if (mbql) {
    const filter = Lib.expressionClauseForLegacyExpression(
      query,
      stageIndex,
      mbql,
    );
    return Lib.filter(query, stageIndex, filter);
  } else {
    return query;
  }
}

export function applyTemporalUnitParameter(query, stageIndex, parameter) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const columns = breakouts.map(breakout =>
    Lib.breakoutColumn(query, stageIndex, breakout),
  );
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [parameter.target[1]],
  );
  if (columnIndex < 0) {
    return query;
  }

  const column = columns[columnIndex];
  const breakout = breakouts[columnIndex];
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  const bucket = buckets.find(
    bucket =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === parameter.value,
  );
  if (!bucket) {
    return query;
  }

  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  return Lib.replaceClause(query, stageIndex, breakout, columnWithBucket);
}
