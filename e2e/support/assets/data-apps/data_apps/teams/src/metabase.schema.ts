const tables = {
  scoreboardActions: {
    /* metadata: { "databaseName": "Writable Postgres12", "schemaName": "public", "tableName": "scoreboard_actions" } */
    type: "table",
    id: 215,
    name: "Scoreboard Actions",
    fields: {
      createdAt: {
        /* metadata: { "displayName": "Created At", "baseType": "type/DateTimeWithLocalTZ" } */
        type: "column",
        name: "created_at",
        slug: "created_at",
        jsType: "Date",
        fieldId: 2167,
        tableId: 215,
      },
      id: {
        /* metadata: { "displayName": "ID", "baseType": "type/Integer", "semanticType": "type/PK" } */
        type: "column",
        name: "id",
        slug: "id",
        jsType: "number",
        fieldId: 2163,
        tableId: 215,
      },
      score: {
        /* metadata: { "displayName": "Score", "baseType": "type/Integer" } */
        type: "column",
        name: "score",
        slug: "score",
        jsType: "number",
        fieldId: 2165,
        tableId: 215,
      },
      status: {
        /* metadata: { "displayName": "Status", "baseType": "type/Text" } */
        type: "column",
        name: "status",
        slug: "status",
        jsType: "string",
        fieldId: 2166,
        tableId: 215,
      },
      teamName: {
        /* metadata: { "displayName": "Team Name", "baseType": "type/Text" } */
        type: "column",
        name: "team_name",
        slug: "team_name",
        jsType: "string",
        fieldId: 2164,
        tableId: 215,
      },
      updatedAt: {
        /* metadata: { "displayName": "Updated At", "baseType": "type/DateTimeWithLocalTZ" } */
        type: "column",
        name: "updated_at",
        slug: "updated_at",
        jsType: "Date",
        fieldId: 2168,
        tableId: 215,
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
