import _ from "underscore";

import type { Series, VizSettingValueCondition } from "metabase-types/api";

function getConditionFn(condition: VizSettingValueCondition) {
  switch (condition.operator) {
    case "=":
      return (a: any, b: any) => a === b;
    case "!=":
      return (a: any, b: any) => a !== b;
    case ">":
      return (a: any, b: any) => a > b;
    case ">=":
      return (a: any, b: any) => a >= b;
    case "<":
      return (a: any, b: any) => a < b;
    case "<=":
      return (a: any, b: any) => a <= b;
    case "contains":
      return (a: any, b: any) => a.includes(b);
    case "does-not-contain":
      return (a: any, b: any) => !a.includes(b);
    case "starts-with":
      return (a: any, b: any) => a.startsWith(b);
    case "ends-with":
      return (a: any, b: any) => a.endsWith(b);
    default:
      return () => false;
  }
}

function checkCondition(condition: VizSettingValueCondition, series: Series) {
  const columnIndex = series[0].data.cols.findIndex(
    col => col.name === condition.column,
  );
  const columnValue = _.last(series[0].data.rows)?.[columnIndex];
  const conditionFn = getConditionFn(condition);
  return conditionFn(columnValue, condition.compareValue);
}

export function resolveConditions(conditions: any[], series: Series) {
  for (const condition of conditions) {
    if (checkCondition(condition, series)) {
      return condition.value;
    }
  }
}
