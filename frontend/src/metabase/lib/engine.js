
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
    let indent = engine === "googleanalytics" ? 2 : null;
    return JSON.stringify(query, null, indent);
}
