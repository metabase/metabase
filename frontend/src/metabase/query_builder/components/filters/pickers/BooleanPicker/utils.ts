import Filter from "metabase-lib/lib/queries/structured/Filter";

export function getValue(filter: Filter) {
  const operatorName = filter.operatorName();
  if (operatorName === "=") {
    const [value] = filter.arguments();
    return value;
  } else {
    return operatorName;
  }
}
