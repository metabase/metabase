export function stableStringifyQuery(query: unknown) {
  return JSON.stringify(sortQueryObject(query));
}

function sortQueryObject(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortQueryObject);
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => [key, sortQueryObject(value)]),
  );
}
