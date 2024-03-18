import type Filter from "metabase-lib/v1/queries/structured/Filter";

export function getValue(filter: Filter) {
  const operatorName = filter.operatorName();
  if (operatorName === "=") {
    const [value] = filter.arguments();
    return value;
  } else {
    return operatorName;
  }
}
