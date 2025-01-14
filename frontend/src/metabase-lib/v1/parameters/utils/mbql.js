import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import { deserializeDateFilter } from "metabase/querying/parameters/utils/dates";
import * as Lib from "metabase-lib";
import {
  deriveFieldOperatorFromParameter,
  getParameterOperatorName,
} from "metabase-lib/v1/parameters/utils/operators";
import {
  getParameterSubType,
  isDateParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { isTemplateTagReference } from "metabase-lib/v1/references";
import { isDimensionTarget } from "metabase-types/guards";

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

function getParameterTargetColumn(query, stageIndex, parameter) {
  if (!isFieldFilterParameterConveratableToMBQL(parameter)) {
    return;
  }

  const columns = Lib.filterableColumns(query, stageIndex);
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [parameter.target[1]],
  );
  if (columnIndex < 0) {
    return;
  }

  return columns[columnIndex];
}

/** compiles a parameter with value to legacy MBQL */
function filterParameterToMBQL(query, stageIndex, parameter, column) {
  // date parameters are handled in `filterParameterToClause`
  if (isDateParameter(parameter)) {
    return;
  }

  const fieldRef = Lib.legacyRef(query, stageIndex, column);
  if (Lib.isNumeric(column)) {
    return numberParameterValueToMBQL(parameter, fieldRef);
  } else {
    return stringParameterValueToMBQL(parameter, fieldRef);
  }
}

function filterParameterToClause(parameter, column) {
  if (isDateParameter(parameter)) {
    if (typeof parameter.value !== "string") {
      return;
    }

    const value = deserializeDateFilter(parameter.value);
    if (value == null) {
      return;
    }

    return getDateFilterClause(column, value);
  }
}

export function applyFilterParameter(query, stageIndex, parameter) {
  const column = getParameterTargetColumn(query, stageIndex, parameter);
  if (!column) {
    return query;
  }

  const clause = filterParameterToClause(parameter, column);
  if (clause != null) {
    return Lib.filter(query, stageIndex, clause);
  }

  // legacy MBQL
  const mbql = filterParameterToMBQL(query, stageIndex, parameter, column);
  if (mbql != null) {
    const filter = Lib.expressionClauseForLegacyExpression(
      query,
      stageIndex,
      mbql,
    );
    return Lib.filter(query, stageIndex, filter);
  }

  return query;
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
