#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/core/auth.ts
function resolveAuth(opts) {
  const apiKey = opts.apiKey || process.env.METABASE_API_KEY;
  const sessionToken = opts.sessionToken || process.env.METABASE_SESSION_TOKEN;
  if (!apiKey && !sessionToken) {
    throw new Error(
      "Authentication required. Set METABASE_API_KEY or METABASE_SESSION_TOKEN environment variable, or pass --api-key or --session-token."
    );
  }
  return { apiKey, sessionToken };
}
function getAuthHeaders(auth) {
  if (auth.apiKey) {
    return { "X-Api-Key": auth.apiKey };
  }
  if (auth.sessionToken) {
    return { "X-Metabase-Session": auth.sessionToken };
  }
  return {};
}

// src/core/client.ts
import createClient from "openapi-fetch";

// src/core/validation.ts
function validatePositiveInt(value, name) {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num < 1) {
    throw new CliError("invalid_parameter", {
      message: `${name} must be a positive integer, got '${value}'`
    });
  }
  return num;
}
var CliError = class extends Error {
  code;
  hint;
  details;
  constructor(code, opts) {
    super(opts.message);
    this.code = code;
    this.hint = opts.hint;
    this.details = opts.details;
  }
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...this.hint && { hint: this.hint },
      ...this.details && { ...this.details }
    };
  }
};

// src/core/client.ts
function createMetabaseClient(config) {
  const authHeaders = getAuthHeaders(config.auth);
  const errorMiddleware = {
    async onResponse({ response }) {
      if (!response.ok && response.status !== 202) {
        let message;
        try {
          const body = await response.clone().json();
          message = typeof body === "object" && body !== null && "message" in body ? String(body.message) : JSON.stringify(body);
        } catch {
          message = `HTTP ${response.status}`;
        }
        throw new CliError("api_error", {
          message,
          details: { status: response.status }
        });
      }
      return response;
    }
  };
  const inner = createClient({
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });
  inner.use(errorMiddleware);
  const wrap = (method) => async (path, opts) => {
    const result = await inner[method](path, opts);
    if (result.error && !result.data) {
      throw new CliError("api_error", {
        message: typeof result.error === "object" && result.error?.message ? String(result.error.message) : JSON.stringify(result.error)
      });
    }
    return { data: result.data };
  };
  return {
    GET: wrap("GET"),
    POST: wrap("POST"),
    PUT: wrap("PUT"),
    DELETE: wrap("DELETE")
  };
}

// src/core/output.ts
function applyFieldMask(data, fields) {
  const result = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}
function applyFieldMaskToArray(data, fields) {
  return data.map((item) => applyFieldMask(item, fields));
}
function truncateRows(rows, maxRows) {
  const total = rows.length;
  const truncated = total > maxRows;
  return {
    rows: truncated ? rows.slice(0, maxRows) : rows,
    meta: {
      truncated,
      total_count: total,
      returned_count: truncated ? maxRows : total
    }
  };
}
function formatOutput(data, opts) {
  if (opts?.fields && typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      data = applyFieldMaskToArray(
        data,
        opts.fields
      );
    } else {
      data = applyFieldMask(data, opts.fields);
    }
  }
  return JSON.stringify(data, null, 2);
}
function printResult(data, opts) {
  process.stdout.write(formatOutput(data, opts) + "\n");
}
function printError(error) {
  if (error && typeof error === "object" && "toJSON" in error) {
    process.stderr.write(
      JSON.stringify(error.toJSON(), null, 2) + "\n"
    );
  } else if (error instanceof Error) {
    process.stderr.write(
      JSON.stringify({ error: "error", message: error.message }, null, 2) + "\n"
    );
  } else {
    process.stderr.write(JSON.stringify({ error: "error", message: String(error) }, null, 2) + "\n");
  }
  process.exitCode = 1;
}

// src/commands/search.ts
function registerSearchCommand(program2, withContext2) {
  program2.command("search <query>").description("Search for tables, dashboards, cards, metrics, segments").option(
    "--models <models>",
    "Comma-separated entity types to filter (table,dashboard,card,metric,segment)"
  ).action(
    withContext2(async (ctx, query, opts) => {
      const options = opts;
      const params = {
        q: String(query)
      };
      if (options.models) {
        params.models = options.models.split(",").map((m) => m.trim());
      }
      const { data } = await ctx.client.GET("/api/search", {
        params: { query: params }
      });
      const raw = data;
      const items = (raw.data ?? (Array.isArray(raw) ? raw : [])).map(
        (item) => ({
          id: item.id,
          name: item.name,
          model: item.model,
          description: item.description,
          database_id: item.database_id,
          table_id: item.table_id
        })
      );
      printResult(
        {
          results: items,
          _meta: { total_count: raw.total ?? items.length }
        },
        ctx.outputOpts
      );
    })
  );
}

// src/commands/database.ts
function registerDatabaseCommands(program2, withContext2) {
  program2.command("list-databases").description("List all databases").option("--include <value>", 'Include related data: "tables"').action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const { data } = await ctx.client.GET("/api/database", {
        params: { query: { include: options.include } }
      });
      const raw = data;
      const databases = Array.isArray(raw) ? raw : raw?.data ?? [];
      const compact = databases.map((db) => ({
        id: db.id,
        name: db.name,
        engine: db.engine,
        ...db.tables ? {
          tables: db.tables.map((t) => ({
            id: t.id,
            name: t.name,
            schema: t.schema
          }))
        } : {}
      }));
      printResult(compact, ctx.outputOpts);
    })
  );
  program2.command("get-database <id>").description("Get database schema \u2014 tables, fields, types").action(
    withContext2(async (ctx, id) => {
      const dbId = validatePositiveInt(id, "database id");
      const { data } = await ctx.client.GET(
        `/api/database/${dbId}/metadata`
      );
      const raw = data;
      const tables = raw?.tables ?? [];
      const compact = {
        id: raw.id,
        name: raw.name,
        engine: raw.engine,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          schema: t.schema,
          display_name: t.display_name,
          fields: (t.fields ?? []).map(
            (f) => ({
              id: f.id,
              name: f.name,
              display_name: f.display_name,
              base_type: f.base_type,
              semantic_type: f.semantic_type
            })
          )
        }))
      };
      printResult(compact, ctx.outputOpts);
    })
  );
}

// src/commands/table.ts
function registerTableCommands(program2, withContext2) {
  program2.command("get-table <id>").description("Get table details \u2014 fields with names, types, and FKs").action(
    withContext2(async (ctx, id) => {
      const tableId = validatePositiveInt(id, "table id");
      const { data } = await ctx.client.GET(
        `/api/table/${tableId}/query_metadata`
      );
      const raw = data;
      const fields = raw?.fields ?? [];
      const compact = {
        id: raw.id,
        name: raw.name,
        display_name: raw.display_name,
        schema: raw.schema,
        db_id: raw.db_id,
        description: raw.description,
        fields: fields.map((f) => ({
          id: f.id,
          name: f.name,
          display_name: f.display_name,
          base_type: f.base_type,
          semantic_type: f.semantic_type,
          fk_target_field_id: f.fk_target_field_id ?? null
        }))
      };
      printResult(compact, ctx.outputOpts);
    })
  );
}

// src/core/schemas.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
var SearchInputSchema = z.object({
  query: z.string().describe("Search query string"),
  models: z.array(z.string()).optional().describe("Filter by entity type: table, dashboard, card, metric, segment")
});
var CreateTransformInputSchema = z.object({
  name: z.string().min(1).describe("Transform name"),
  database_id: z.number().int().positive().describe("Source database ID"),
  sql: z.string().min(1).describe("SQL query for the transform source"),
  target_table: z.string().min(1).describe("Name for the output table"),
  target_schema: z.string().optional().describe("Schema for the output table"),
  target_database_id: z.number().int().positive().optional().describe("Target database ID (defaults to source database)"),
  description: z.string().optional().describe("Transform description"),
  run: z.boolean().optional().describe("If true, run the transform immediately after creation")
});
var VisualizationSchema = z.object({
  x_axis: z.array(z.string()).optional().describe("Column names for X axis (\u2192 graph.dimensions)"),
  y_axis: z.array(z.string()).optional().describe("Column names for Y axis (\u2192 graph.metrics)"),
  stack: z.enum(["stacked", "normalized"]).optional().describe("Stack type for bar/area charts"),
  show_values: z.boolean().optional().describe("Show values on chart"),
  x_axis_label: z.string().optional().describe("X axis label"),
  y_axis_label: z.string().optional().describe("Y axis label"),
  line_style: z.enum(["solid", "dashed", "dotted"]).optional().describe("Line style"),
  line_interpolation: z.enum(["linear", "cardinal", "monotone"]).optional().describe("Line interpolation"),
  // Pie chart
  dimension: z.array(z.string()).optional().describe("Pie chart: category columns"),
  metric: z.string().optional().describe("Pie chart: value column"),
  show_legend: z.boolean().optional().describe("Show legend"),
  // Map
  map_type: z.enum(["pin", "region", "grid"]).optional(),
  map_region: z.string().optional()
}).optional().describe("Visualization settings (CLI translates to Metabase format)");
var DISPLAY_TYPES = [
  "line",
  "bar",
  "area",
  "combo",
  "scatter",
  "waterfall",
  "funnel",
  "sankey",
  "scalar",
  "smartscalar",
  "gauge",
  "progress",
  "table",
  "pivot",
  "pie",
  "row",
  "map",
  "boxplot"
];
var CreateQuestionInputSchema = z.object({
  name: z.string().min(1).describe("Question name"),
  database_id: z.number().int().positive().describe("Database ID"),
  sql: z.string().min(1).describe("SQL query"),
  display: z.enum(DISPLAY_TYPES).default("table").describe("Visualization type"),
  type: z.enum(["question", "model"]).default("question").describe("Card type (question or model)"),
  visualization: VisualizationSchema,
  collection_id: z.number().int().positive().optional().describe("Collection ID"),
  description: z.string().optional().describe("Question description")
});
var FilterSchema = z.object({
  field: z.string().describe("Field name (resolved to ID automatically)"),
  op: z.string().describe("Filter operation: equals, greater-than, contains, is-null, etc."),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional()
});
var CreateSegmentInputSchema = z.object({
  name: z.string().min(1).describe("Segment name"),
  table_id: z.number().int().positive().describe("Table ID"),
  filters: z.array(FilterSchema).min(1).describe("Filter conditions using field names"),
  description: z.string().optional().describe("Segment description")
});
var DashboardCardSchema = z.object({
  card_id: z.number().int().positive().describe("Question/card ID"),
  width: z.number().int().positive().default(6).describe("Width in grid units (max 18)"),
  height: z.number().int().positive().default(4).describe("Height in grid units"),
  row: z.number().int().min(0).optional().describe("Row position (auto-calculated if omitted)"),
  col: z.number().int().min(0).optional().describe("Column position (auto-calculated if omitted)")
});
var DashboardFilterTargetSchema = z.object({
  card_id: z.number().int().positive().describe("Card ID to wire this filter to"),
  field: z.string().describe("Field name on the card's table (resolved automatically)")
});
var DashboardFilterSchema = z.object({
  name: z.string().describe("Filter label shown on dashboard"),
  type: z.string().describe("Filter type: date/range, category, number, string, id, etc."),
  targets: z.array(DashboardFilterTargetSchema).describe("Cards and fields this filter connects to")
});
var CreateDashboardInputSchema = z.object({
  name: z.string().min(1).describe("Dashboard name"),
  description: z.string().optional().describe("Dashboard description"),
  collection_id: z.number().int().positive().optional().describe("Collection ID"),
  cards: z.array(DashboardCardSchema).optional().describe("Cards to place on the dashboard"),
  filters: z.array(DashboardFilterSchema).optional().describe("Dashboard filters wired to card fields")
});
var AddCardToDashboardInputSchema = z.object({
  dashboard_id: z.number().int().positive().describe("Dashboard ID"),
  card_id: z.number().int().positive().describe("Card/question ID to add"),
  width: z.number().int().positive().default(6),
  height: z.number().int().positive().default(4),
  filter_mappings: z.array(
    z.object({
      filter_name: z.string().describe("Name of existing dashboard filter"),
      field: z.string().describe("Field name to wire the filter to")
    })
  ).optional().describe("Wire this card to existing dashboard filters")
});
var ExecuteQueryInputSchema = z.object({
  database_id: z.number().int().positive().describe("Database ID"),
  sql: z.string().min(1).describe("SQL query to execute")
});
var schemaRegistry = {
  search: SearchInputSchema,
  "create-transform": CreateTransformInputSchema,
  "create-question": CreateQuestionInputSchema,
  "create-segment": CreateSegmentInputSchema,
  "create-dashboard": CreateDashboardInputSchema,
  "add-card-to-dashboard": AddCardToDashboardInputSchema,
  "execute-query": ExecuteQueryInputSchema
};
function getSchemaForCommand(commandName) {
  const schema = schemaRegistry[commandName];
  if (!schema) return void 0;
  return zodToJsonSchema(schema, { name: commandName, target: "openApi3" });
}
function listSchemaCommands() {
  return Object.keys(schemaRegistry);
}

// src/commands/transform.ts
function registerTransformCommands(program2, withContext2) {
  program2.command("create-transform").description("Create a SQL transform. Use --run to execute immediately.").requiredOption("--json <payload>", "JSON input (see: schema create-transform)").action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = CreateTransformInputSchema.parse(
        JSON.parse(options.json)
      );
      const apiPayload = {
        name: input.name,
        description: input.description ?? null,
        source: {
          type: "query",
          query: {
            database: input.database_id,
            type: "native",
            native: { query: input.sql }
          }
        },
        target: {
          type: "table",
          name: input.target_table,
          ...input.target_schema && { schema: input.target_schema },
          ...input.target_database_id && {
            database: input.target_database_id
          }
        }
      };
      if (ctx.dryRun) {
        printResult({
          dry_run: true,
          api_calls: [
            { method: "POST", path: "/api/transform", body: apiPayload },
            ...input.run ? [
              {
                method: "POST",
                path: "/api/transform/{id}/run",
                note: "Would poll for completion"
              }
            ] : []
          ]
        });
        return;
      }
      const { data: transform } = await ctx.client.POST("/api/transform", {
        body: apiPayload
      });
      const result = transform;
      if (input.run && result.id) {
        const transformId = result.id;
        const { data: runResult } = await ctx.client.POST(
          `/api/transform/${transformId}/run`
        );
        const run = runResult;
        if (run.run_id) {
          const finalStatus = await pollTransformRun(
            ctx,
            run.run_id
          );
          printResult({
            transform: { id: result.id, name: result.name },
            run: finalStatus
          });
          return;
        }
      }
      printResult({
        id: result.id,
        name: result.name,
        source_type: result.source_type
      });
    })
  );
  program2.command("get-transform <id>").description("Get transform details \u2014 name, SQL query, target table, run status").action(
    withContext2(async (ctx, id) => {
      const transformId = validatePositiveInt(id, "transform id");
      const { data } = await ctx.client.GET(
        `/api/transform/${transformId}`
      );
      const raw = data;
      const source = raw.source;
      const sourceQuery = source?.query;
      const nativeQuery = sourceQuery?.native;
      const target = raw.target;
      const lastRun = raw.last_run;
      const compact = {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        database_id: sourceQuery?.database ?? null,
        sql: nativeQuery?.query ?? null,
        target_table: target?.name ?? null,
        target_schema: target?.schema ?? null,
        last_run_status: lastRun?.status ?? null,
        last_run_at: lastRun?.started_at ?? null
      };
      printResult(compact, ctx.outputOpts);
    })
  );
  program2.command("list-transforms").description("List all transforms with latest run status").action(
    withContext2(async (ctx) => {
      const { data } = await ctx.client.GET("/api/transform");
      const raw = data;
      const compact = raw.map((t) => ({
        id: t.id,
        name: t.name,
        source_type: t.source_type,
        last_run_status: t.last_run?.status ?? null
      }));
      printResult(compact, ctx.outputOpts);
    })
  );
  program2.command("get-transform-run <runId>").description("Check transform execution status").action(
    withContext2(async (ctx, runId) => {
      const id = validatePositiveInt(runId, "run id");
      const { data } = await ctx.client.GET(
        `/api/transform/run/${id}`
      );
      printResult(data, ctx.outputOpts);
    })
  );
  program2.command("update-transform <id>").description("Update a transform").requiredOption("--json <payload>", "JSON input with fields to update").action(
    withContext2(async (ctx, id, opts) => {
      const transformId = validatePositiveInt(id, "transform id");
      const options = opts;
      const input = JSON.parse(options.json);
      const apiPayload = {};
      if (input.name) apiPayload.name = input.name;
      if (input.description !== void 0)
        apiPayload.description = input.description;
      if (input.sql) {
        const dbId = input.database_id;
        if (!dbId) {
          throw new CliError("missing_parameter", {
            message: "database_id is required when updating SQL",
            hint: "Include database_id in the JSON payload"
          });
        }
        apiPayload.source = {
          type: "query",
          query: {
            database: dbId,
            type: "native",
            native: { query: input.sql }
          }
        };
      }
      if (input.target_table) {
        apiPayload.target = {
          type: "table",
          name: input.target_table,
          ...input.target_schema && { schema: input.target_schema }
        };
      }
      const { data } = await ctx.client.PUT(
        `/api/transform/${transformId}`,
        { body: apiPayload }
      );
      const result = data;
      printResult({ id: result.id, name: result.name });
    })
  );
}
async function pollTransformRun(ctx, runId, maxWaitMs = 3e5) {
  const start = Date.now();
  let delayMs = 1e3;
  while (Date.now() - start < maxWaitMs) {
    const { data } = await ctx.client.GET(
      `/api/transform/run/${runId}`
    );
    const run = data;
    const status = run.status;
    if (status === "succeeded" || status === "failed" || status === "timeout" || status === "canceled") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 1.5, 1e4);
  }
  return { status: "polling_timeout", run_id: runId };
}

// src/commands/question.ts
function buildVisualizationSettings(viz) {
  if (!viz) return {};
  const settings = {};
  if (viz.x_axis) settings["graph.dimensions"] = viz.x_axis;
  if (viz.y_axis) settings["graph.metrics"] = viz.y_axis;
  if (viz.stack) settings["stackable.stack_type"] = viz.stack;
  if (viz.show_values !== void 0)
    settings["graph.show_values"] = viz.show_values;
  if (viz.x_axis_label) settings["graph.x_axis.title_text"] = viz.x_axis_label;
  if (viz.y_axis_label) settings["graph.y_axis.title_text"] = viz.y_axis_label;
  if (viz.line_style) settings["line.style"] = viz.line_style;
  if (viz.line_interpolation)
    settings["line.interpolate"] = viz.line_interpolation;
  if (viz.dimension) settings["pie.dimension"] = viz.dimension;
  if (viz.metric) settings["pie.metric"] = viz.metric;
  if (viz.show_legend !== void 0)
    settings["pie.show_legend"] = viz.show_legend;
  if (viz.map_type) settings["map.type"] = viz.map_type;
  if (viz.map_region) settings["map.region"] = viz.map_region;
  return settings;
}
function registerQuestionCommands(program2, withContext2) {
  program2.command("create-question").description(
    "Create a saved question (card) from SQL with visualization settings"
  ).requiredOption(
    "--json <payload>",
    "JSON input (see: schema create-question)"
  ).action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = CreateQuestionInputSchema.parse(
        JSON.parse(options.json)
      );
      const vizSettings = buildVisualizationSettings(
        input.visualization
      );
      const apiPayload = {
        name: input.name,
        type: input.type,
        dataset_query: {
          type: "native",
          database: input.database_id,
          native: { query: input.sql }
        },
        display: input.display,
        visualization_settings: vizSettings,
        ...input.collection_id && { collection_id: input.collection_id },
        ...input.description && { description: input.description }
      };
      if (ctx.dryRun) {
        printResult({
          dry_run: true,
          api_calls: [
            { method: "POST", path: "/api/card", body: apiPayload }
          ]
        });
        return;
      }
      const { data } = await ctx.client.POST("/api/card", {
        body: apiPayload
      });
      const result = data;
      printResult({
        id: result.id,
        name: result.name,
        display: result.display,
        type: result.type
      });
    })
  );
  program2.command("update-question <id>").description("Update a question's SQL, display, or visualization").requiredOption("--json <payload>", "JSON input with fields to update").action(
    withContext2(async (ctx, id, opts) => {
      const cardId = validatePositiveInt(id, "question id");
      const options = opts;
      const input = JSON.parse(options.json);
      const apiPayload = {};
      if (input.name) apiPayload.name = input.name;
      if (input.description !== void 0)
        apiPayload.description = input.description;
      if (input.display) apiPayload.display = input.display;
      if (input.sql && input.database_id) {
        apiPayload.dataset_query = {
          type: "native",
          database: input.database_id,
          native: { query: input.sql }
        };
      }
      if (input.visualization) {
        apiPayload.visualization_settings = buildVisualizationSettings(
          input.visualization
        );
      }
      const { data } = await ctx.client.PUT(`/api/card/${cardId}`, {
        body: apiPayload
      });
      const result = data;
      printResult({ id: result.id, name: result.name });
    })
  );
  program2.command("run-question <id>").description("Run a saved question and return sample results").option("--max-rows <n>", "Max rows to return (default: 10)", "10").action(
    withContext2(async (ctx, id, opts) => {
      const cardId = validatePositiveInt(id, "question id");
      const options = opts;
      const maxRows = options.maxRows ? parseInt(options.maxRows, 10) : 10;
      const { data } = await ctx.client.POST(
        `/api/card/${cardId}/query`,
        {}
      );
      const result = data;
      const resultData = result.data;
      const cols = resultData?.cols ?? [];
      const rows = resultData?.rows ?? [];
      const { rows: truncatedRows, meta } = truncateRows(rows, maxRows);
      printResult({
        card_id: cardId,
        status: result.status,
        columns: cols.map((c) => ({
          name: c.name,
          display_name: c.display_name,
          base_type: c.base_type
        })),
        rows: truncatedRows,
        row_count: result.row_count,
        running_time: result.running_time,
        _meta: meta
      });
    })
  );
}

// src/core/field-resolver.ts
var FieldResolver = class {
  cache = /* @__PURE__ */ new Map();
  client;
  constructor(client) {
    this.client = client;
  }
  /**
   * Resolve a field reference to a numeric ID.
   * Accepts: numeric ID (passthrough), field name string (looked up from table metadata).
   */
  async resolve(tableId, fieldRef) {
    if (typeof fieldRef === "number") return fieldRef;
    const asNum = Number(fieldRef);
    if (!isNaN(asNum) && Number.isInteger(asNum)) return asNum;
    const fields = await this.getTableFields(tableId);
    const match = fields.find(
      (f) => f.name.toLowerCase() === fieldRef.toLowerCase() || f.display_name.toLowerCase() === fieldRef.toLowerCase()
    );
    if (!match) {
      const available = fields.map((f) => f.name);
      const suggestion = findClosest(fieldRef, available);
      throw new CliError("unknown_field", {
        message: `Field '${fieldRef}' not found on table ${tableId}`,
        hint: suggestion ? `Did you mean '${suggestion}'? Available fields: ${available.join(", ")}` : `Available fields: ${available.join(", ")}`,
        details: { available_fields: available }
      });
    }
    return match.id;
  }
  async getTableFields(tableId) {
    if (this.cache.has(tableId)) {
      return this.cache.get(tableId);
    }
    const { data } = await this.client.GET(
      `/api/table/${tableId}/query_metadata`
    );
    const raw = data;
    const fields = (raw?.fields ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      display_name: f.display_name,
      base_type: f.base_type,
      semantic_type: f.semantic_type
    }));
    this.cache.set(tableId, fields);
    return fields;
  }
};
function findClosest(target, candidates) {
  const t = target.toLowerCase();
  let best;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(t, c.toLowerCase());
    if (d < bestDist && d <= Math.max(t.length, c.length) * 0.5) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

// src/commands/segment.ts
var OP_MAP = {
  equals: "=",
  "not-equals": "!=",
  "greater-than": ">",
  "greater-than-or-equal": ">=",
  "less-than": "<",
  "less-than-or-equal": "<=",
  contains: "contains",
  "not-contains": "does-not-contain",
  "starts-with": "starts-with",
  "ends-with": "ends-with",
  "is-null": "is-null",
  "is-not-null": "not-null",
  "is-empty": "is-empty",
  "is-not-empty": "not-empty"
};
async function buildMbqlFilter(resolver, tableId, filters) {
  if (filters.length === 1) {
    return await buildSingleFilter(resolver, tableId, filters[0]);
  }
  const clauses = await Promise.all(
    filters.map((f) => buildSingleFilter(resolver, tableId, f))
  );
  return ["and", ...clauses];
}
async function buildSingleFilter(resolver, tableId, filter) {
  const fieldId = await resolver.resolve(tableId, filter.field);
  const mbqlOp = OP_MAP[filter.op] ?? filter.op;
  const fieldRef = ["field", fieldId, null];
  if (mbqlOp === "is-null" || mbqlOp === "not-null" || mbqlOp === "is-empty" || mbqlOp === "not-empty") {
    return [mbqlOp, fieldRef];
  }
  if (filter.values) {
    return [mbqlOp, fieldRef, ...filter.values];
  }
  return [mbqlOp, fieldRef, filter.value];
}
function registerSegmentCommands(program2, withContext2) {
  program2.command("create-segment").description("Create a reusable filter (segment) on a table").requiredOption(
    "--json <payload>",
    "JSON input (see: schema create-segment)"
  ).action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = CreateSegmentInputSchema.parse(
        JSON.parse(options.json)
      );
      const resolver = new FieldResolver(ctx.client);
      const mbqlFilter = await buildMbqlFilter(
        resolver,
        input.table_id,
        input.filters
      );
      const apiPayload = {
        name: input.name,
        table_id: input.table_id,
        definition: {
          filter: mbqlFilter
        },
        ...input.description && { description: input.description }
      };
      if (ctx.dryRun) {
        printResult({
          dry_run: true,
          api_calls: [
            { method: "POST", path: "/api/segment", body: apiPayload }
          ]
        });
        return;
      }
      const { data } = await ctx.client.POST("/api/segment", {
        body: apiPayload
      });
      const result = data;
      printResult({
        id: result.id,
        name: result.name,
        table_id: result.table_id
      });
    })
  );
  program2.command("update-segment <id>").description("Update a segment").requiredOption("--json <payload>", "JSON input with fields to update").action(
    withContext2(async (ctx, id, opts) => {
      const segmentId = validatePositiveInt(id, "segment id");
      const options = opts;
      const input = JSON.parse(options.json);
      const apiPayload = {
        revision_message: input.revision_message ?? "Updated via CLI"
      };
      if (input.name) apiPayload.name = input.name;
      if (input.description !== void 0)
        apiPayload.description = input.description;
      if (input.filters && input.table_id) {
        const resolver = new FieldResolver(ctx.client);
        const mbqlFilter = await buildMbqlFilter(
          resolver,
          input.table_id,
          input.filters
        );
        apiPayload.definition = { filter: mbqlFilter };
      }
      const { data } = await ctx.client.PUT(`/api/segment/${segmentId}`, {
        body: apiPayload
      });
      const result = data;
      printResult({ id: result.id, name: result.name });
    })
  );
}

// src/commands/dashboard.ts
import { randomUUID } from "crypto";
var GRID_WIDTH = 18;
function autoLayout(cards, startRow = 0) {
  let currentRow = startRow;
  let currentCol = 0;
  let maxHeightInRow = 0;
  return cards.map((card) => {
    if (card.row !== void 0 && card.col !== void 0) {
      return {
        card_id: card.card_id,
        width: card.width,
        height: card.height,
        row: card.row,
        col: card.col
      };
    }
    if (currentCol + card.width > GRID_WIDTH) {
      currentRow += maxHeightInRow;
      currentCol = 0;
      maxHeightInRow = 0;
    }
    const layout = {
      card_id: card.card_id,
      width: card.width,
      height: card.height,
      row: currentRow,
      col: currentCol
    };
    currentCol += card.width;
    maxHeightInRow = Math.max(maxHeightInRow, card.height);
    return layout;
  });
}
async function resolveCardField(ctx, resolver, cardId, fieldName) {
  const { data } = await ctx.client.GET(`/api/card/${cardId}`);
  const card = data;
  const query = card.dataset_query;
  if (query?.type === "native") {
    const resultMeta = card.result_metadata;
    if (resultMeta) {
      const col = resultMeta.find(
        (c) => c.name?.toLowerCase() === fieldName.toLowerCase() || c.display_name?.toLowerCase() === fieldName.toLowerCase()
      );
      if (col?.id && typeof col.id === "number") {
        return col.id;
      }
    }
    throw new CliError("field_resolution", {
      message: `Cannot resolve field '${fieldName}' on native SQL card ${cardId}`,
      hint: "For SQL cards, dashboard filter mapping requires the card to have been run at least once so result metadata is available."
    });
  }
  const innerQuery = query?.query;
  const tableId = innerQuery?.["source-table"];
  if (!tableId) {
    throw new CliError("field_resolution", {
      message: `Cannot determine source table for card ${cardId}`
    });
  }
  return resolver.resolve(tableId, fieldName);
}
function registerDashboardCommands(program2, withContext2) {
  program2.command("create-dashboard").description(
    "Create a dashboard with cards and filters in one step"
  ).requiredOption(
    "--json <payload>",
    "JSON input (see: schema create-dashboard)"
  ).action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = CreateDashboardInputSchema.parse(
        JSON.parse(options.json)
      );
      const createPayload = {
        name: input.name,
        ...input.description && { description: input.description },
        ...input.collection_id && { collection_id: input.collection_id }
      };
      const parameters = (input.filters ?? []).map((f) => ({
        id: randomUUID().slice(0, 8),
        name: f.name,
        type: f.type,
        slug: f.name.toLowerCase().replace(/\s+/g, "_")
      }));
      if (ctx.dryRun) {
        const layouts = autoLayout(
          (input.cards ?? []).map((c) => ({
            card_id: c.card_id,
            width: c.width ?? 6,
            height: c.height ?? 4,
            row: c.row,
            col: c.col
          }))
        );
        printResult({
          dry_run: true,
          api_calls: [
            {
              method: "POST",
              path: "/api/dashboard",
              body: { ...createPayload, parameters }
            },
            ...input.cards?.length ? [
              {
                method: "PUT",
                path: "/api/dashboard/{id}",
                body: {
                  dashcards: layouts.map((l) => ({
                    id: -1,
                    card_id: l.card_id,
                    size_x: l.width,
                    size_y: l.height,
                    row: l.row,
                    col: l.col
                  })),
                  parameters
                }
              }
            ] : []
          ]
        });
        return;
      }
      const { data: dashboard } = await ctx.client.POST("/api/dashboard", {
        body: { ...createPayload, parameters }
      });
      const dashboardResult = dashboard;
      const dashboardId = dashboardResult.id;
      if (input.cards?.length) {
        const layouts = autoLayout(
          input.cards.map((c) => ({
            card_id: c.card_id,
            width: c.width ?? 6,
            height: c.height ?? 4,
            row: c.row,
            col: c.col
          }))
        );
        const resolver = new FieldResolver(ctx.client);
        const dashcards = await Promise.all(
          layouts.map(async (layout, _idx) => {
            const parameterMappings = [];
            if (input.filters) {
              for (let fi = 0; fi < input.filters.length; fi++) {
                const filter = input.filters[fi];
                const target = filter.targets.find(
                  (t) => t.card_id === layout.card_id
                );
                if (target) {
                  try {
                    const fieldId = await resolveCardField(
                      ctx,
                      resolver,
                      target.card_id,
                      target.field
                    );
                    parameterMappings.push({
                      parameter_id: parameters[fi].id,
                      card_id: layout.card_id,
                      target: ["dimension", ["field", fieldId, null]]
                    });
                  } catch {
                    parameterMappings.push({
                      parameter_id: parameters[fi].id,
                      card_id: layout.card_id,
                      target: [
                        "dimension",
                        ["field", target.field, { "base-type": "type/Text" }]
                      ]
                    });
                  }
                }
              }
            }
            return {
              id: -layout.card_id,
              // negative = new dashcard
              card_id: layout.card_id,
              size_x: layout.width,
              size_y: layout.height,
              row: layout.row,
              col: layout.col,
              parameter_mappings: parameterMappings
            };
          })
        );
        await ctx.client.PUT(`/api/dashboard/${dashboardId}`, {
          body: { dashcards, parameters }
        });
      }
      printResult({
        id: dashboardId,
        name: input.name,
        cards_added: input.cards?.length ?? 0,
        filters_added: input.filters?.length ?? 0
      });
    })
  );
  program2.command("add-card-to-dashboard").description("Add a card to an existing dashboard").requiredOption(
    "--json <payload>",
    "JSON input (see: schema add-card-to-dashboard)"
  ).action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = AddCardToDashboardInputSchema.parse(
        JSON.parse(options.json)
      );
      const { data: dashboard } = await ctx.client.GET(
        `/api/dashboard/${input.dashboard_id}`
      );
      const dashData = dashboard;
      const existingDashcards = dashData.dashcards ?? [];
      const existingParams = dashData.parameters ?? [];
      let maxBottom = 0;
      for (const dc of existingDashcards) {
        const bottom = (dc.row ?? 0) + (dc.size_y ?? 4);
        maxBottom = Math.max(maxBottom, bottom);
      }
      const parameterMappings = [];
      if (input.filter_mappings) {
        const resolver = new FieldResolver(ctx.client);
        for (const mapping of input.filter_mappings) {
          const param = existingParams.find(
            (p) => p.name?.toLowerCase() === mapping.filter_name.toLowerCase()
          );
          if (!param) {
            throw new CliError("unknown_filter", {
              message: `Filter '${mapping.filter_name}' not found on dashboard ${input.dashboard_id}`,
              hint: `Available filters: ${existingParams.map((p) => p.name).join(", ")}`
            });
          }
          try {
            const fieldId = await resolveCardField(
              ctx,
              resolver,
              input.card_id,
              mapping.field
            );
            parameterMappings.push({
              parameter_id: param.id,
              card_id: input.card_id,
              target: ["dimension", ["field", fieldId, null]]
            });
          } catch {
            parameterMappings.push({
              parameter_id: param.id,
              card_id: input.card_id,
              target: [
                "dimension",
                ["field", mapping.field, { "base-type": "type/Text" }]
              ]
            });
          }
        }
      }
      const newDashcard = {
        id: -input.card_id,
        card_id: input.card_id,
        size_x: input.width ?? 6,
        size_y: input.height ?? 4,
        row: maxBottom,
        col: 0,
        parameter_mappings: parameterMappings
      };
      const allDashcards = [
        ...existingDashcards.map((dc) => ({
          id: dc.id,
          card_id: dc.card_id,
          size_x: dc.size_x,
          size_y: dc.size_y,
          row: dc.row,
          col: dc.col,
          parameter_mappings: dc.parameter_mappings ?? []
        })),
        newDashcard
      ];
      await ctx.client.PUT(`/api/dashboard/${input.dashboard_id}`, {
        body: { dashcards: allDashcards }
      });
      printResult({
        dashboard_id: input.dashboard_id,
        card_id: input.card_id,
        position: { row: maxBottom, col: 0 }
      });
    })
  );
  program2.command("get-dashboard <id>").description("Get a dashboard with all its cards").action(
    withContext2(async (ctx, id) => {
      const dashId = validatePositiveInt(id, "dashboard id");
      const { data } = await ctx.client.GET(
        `/api/dashboard/${dashId}`
      );
      const raw = data;
      const dashcards = raw.dashcards ?? [];
      const compact = {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        parameters: raw.parameters,
        cards: dashcards.map((dc) => ({
          dashcard_id: dc.id,
          card_id: dc.card_id,
          card_name: dc.card?.name,
          size_x: dc.size_x,
          size_y: dc.size_y,
          row: dc.row,
          col: dc.col
        }))
      };
      printResult(compact, ctx.outputOpts);
    })
  );
}

// src/commands/query.ts
function registerQueryCommands(program2, withContext2) {
  program2.command("execute-query").description("Execute an ad-hoc SQL query").requiredOption(
    "--json <payload>",
    "JSON input (see: schema execute-query)"
  ).action(
    withContext2(async (ctx, opts) => {
      const options = opts;
      const input = ExecuteQueryInputSchema.parse(
        JSON.parse(options.json)
      );
      const apiPayload = {
        database: input.database_id,
        type: "native",
        native: { query: input.sql }
      };
      if (ctx.dryRun) {
        printResult({
          dry_run: true,
          api_calls: [
            { method: "POST", path: "/api/dataset", body: apiPayload }
          ]
        });
        return;
      }
      const { data } = await ctx.client.POST("/api/dataset", {
        body: apiPayload
      });
      const result = data;
      const resultData = result.data;
      const cols = resultData?.cols ?? [];
      const rows = resultData?.rows ?? [];
      const maxRows = ctx.outputOpts.maxRows ?? 50;
      const { rows: truncatedRows, meta } = truncateRows(rows, maxRows);
      printResult({
        status: result.status,
        columns: cols.map((c) => ({
          name: c.name,
          display_name: c.display_name,
          base_type: c.base_type
        })),
        rows: truncatedRows,
        row_count: result.row_count,
        running_time: result.running_time,
        _meta: meta
      });
    })
  );
}

// src/commands/schema-cmd.ts
function registerSchemaCommand(program2) {
  program2.command("schema [command]").description(
    "Print JSON Schema for a command's input. Run without args to list available schemas."
  ).action((command) => {
    if (!command) {
      printResult({
        available_schemas: listSchemaCommands(),
        usage: "metabase-agent schema <command-name>"
      });
      return;
    }
    const schema = getSchemaForCommand(command);
    if (!schema) {
      const available = listSchemaCommands();
      printResult({
        error: "unknown_command",
        message: `No schema found for command '${command}'`,
        available_schemas: available
      });
      process.exitCode = 1;
      return;
    }
    printResult(schema);
  });
}

// src/index.ts
function createContext(opts) {
  const baseUrl = opts.url || process.env.METABASE_URL;
  if (!baseUrl) {
    throw new CliError("missing_config", {
      message: "Metabase URL required. Set METABASE_URL environment variable or pass --url."
    });
  }
  const auth = resolveAuth({
    apiKey: opts.apiKey,
    sessionToken: opts.sessionToken
  });
  const client = createMetabaseClient({ baseUrl, auth });
  const fields = opts.fields?.split(",").map((f) => f.trim());
  const maxRows = opts.maxRows ? parseInt(opts.maxRows, 10) : 50;
  return {
    client,
    outputOpts: { fields, maxRows },
    dryRun: opts.dryRun ?? false
  };
}
var program = new Command();
program.name("metabase-agent").description(
  "Agent-friendly CLI for Metabase \u2014 discover data, create transforms, build dashboards"
).version("0.1.0").option("--url <url>", "Metabase instance URL (or METABASE_URL env)").option("--api-key <key>", "API key (or METABASE_API_KEY env)").option(
  "--session-token <token>",
  "Session token (or METABASE_SESSION_TOKEN env)"
).option("--fields <fields>", "Comma-separated field mask for response").option("--max-rows <n>", "Max rows in query results (default: 50)").option("--dry-run", "Show resolved API calls without executing");
function withContext(fn) {
  return async (...args) => {
    try {
      const cmd = args[args.length - 1];
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createContext(globalOpts);
      await fn(ctx, ...args.slice(0, -1));
    } catch (error) {
      printError(error);
    }
  };
}
registerSearchCommand(program, withContext);
registerDatabaseCommands(program, withContext);
registerTableCommands(program, withContext);
registerTransformCommands(program, withContext);
registerQuestionCommands(program, withContext);
registerSegmentCommands(program, withContext);
registerDashboardCommands(program, withContext);
registerQueryCommands(program, withContext);
registerSchemaCommand(program);
program.command("ping").description("Health check \u2014 verify connection to Metabase").action(
  withContext(async (ctx) => {
    const { data } = await ctx.client.GET("/api/health");
    printResult(data);
  })
);
program.parse();
//# sourceMappingURL=index.js.map