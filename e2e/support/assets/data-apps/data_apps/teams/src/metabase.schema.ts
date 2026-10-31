const tables = {
  scoreboardActions: {
    /* metadata: { "databaseName": "Writable Postgres12", "schemaName": "public", "tableName": "scoreboard_actions" } */
    type: "table",
    id: 215,
    name: "Scoreboard Actions",
    fields: {
      createdAt: {
        /* metadata: { "displayName": "Created At" } */
        type: "column",
        name: "created_at",
        sourceName: "scoreboard_actions",
        jsType: "Date",
        fieldId: 2167,
        tableId: 215,
        baseType: "type/DateTimeWithLocalTZ",
      },
      id: {
        /* metadata: { "displayName": "ID", "semanticType": "type/PK" } */
        type: "column",
        name: "id",
        sourceName: "scoreboard_actions",
        jsType: "number",
        fieldId: 2163,
        tableId: 215,
        baseType: "type/Integer",
      },
      score: {
        /* metadata: { "displayName": "Score" } */
        type: "column",
        name: "score",
        sourceName: "scoreboard_actions",
        jsType: "number",
        fieldId: 2165,
        tableId: 215,
        baseType: "type/Integer",
      },
      status: {
        /* metadata: { "displayName": "Status" } */
        type: "column",
        name: "status",
        sourceName: "scoreboard_actions",
        jsType: "string",
        fieldId: 2166,
        tableId: 215,
        baseType: "type/Text",
      },
      teamName: {
        /* metadata: { "displayName": "Team Name" } */
        type: "column",
        name: "team_name",
        sourceName: "scoreboard_actions",
        jsType: "string",
        fieldId: 2164,
        tableId: 215,
        baseType: "type/Text",
      },
      updatedAt: {
        /* metadata: { "displayName": "Updated At" } */
        type: "column",
        name: "updated_at",
        sourceName: "scoreboard_actions",
        jsType: "Date",
        fieldId: 2168,
        tableId: 215,
        baseType: "type/DateTimeWithLocalTZ",
      },
    },
  },
} as const;

const metrics = {} as const;

const schema = {
  schemaVersion: 3,
  generatedAt: "2026-10-30T00:00:00Z",
  metabase: {
    instanceUrl: "http://localhost:4000",
  },
  tables: tables,
  metrics: metrics,
} as const;

export { schema };
