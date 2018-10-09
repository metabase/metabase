export function getEngineNativeType(engine) {
  switch (engine) {
    case "mongo":
    case "druid":
    case "googleanalytics":
      return "json";
    default:
      return "sql";
  }
}

export function getEngineNativeAceMode(engine) {
  switch (engine) {
    case "mongo":
    case "druid":
    case "googleanalytics":
      return "ace/mode/json";
    case "mysql":
      return "ace/mode/mysql";
    case "postgres":
      return "ace/mode/pgsql";
    case "sqlserver":
      return "ace/mode/sqlserver";
    default:
      return "ace/mode/sql";
  }
}

export function getEngineNativeRequiresTable(engine) {
  return engine === "mongo";
}

export function formatJsonQuery(query, engine) {
  if (engine === "googleanalytics") {
    return formatGAQuery(query);
  } else {
    return JSON.stringify(query);
  }
}

const GA_ORDERED_PARAMS = [
  "ids",
  "start-date",
  "end-date",
  "metrics",
  "dimensions",
  "sort",
  "filters",
  "segment",
  "samplingLevel",
  "include-empty-rows",
  "start-index",
  "max-results",
];

// does 3 things: removes null values, sorts the keys by the order in the documentation, and formats with 2 space indents
function formatGAQuery(query) {
  const object = {};
  for (const param of GA_ORDERED_PARAMS) {
    if (query[param] != null) {
      object[param] = query[param];
    }
  }
  return JSON.stringify(object, null, 2);
}
