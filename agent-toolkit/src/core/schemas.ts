import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ----- CLI input schemas (simplified, agent-friendly) -----

export const SearchInputSchema = z.object({
  query: z.string().describe("Search query string"),
  models: z
    .array(z.string())
    .optional()
    .describe("Filter by entity type: table, dashboard, card, metric, segment"),
});

export const CreateTransformInputSchema = z.object({
  name: z.string().min(1).describe("Transform name"),
  database_id: z.number().int().positive().describe("Source database ID"),
  sql: z.string().min(1).describe("SQL query for the transform source"),
  target_table: z.string().min(1).describe("Name for the output table"),
  target_schema: z.string().optional().describe("Schema for the output table"),
  target_database_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Target database ID (defaults to source database)"),
  description: z.string().optional().describe("Transform description"),
  run: z
    .boolean()
    .optional()
    .describe("If true, run the transform immediately after creation"),
});

const VisualizationSchema = z
  .object({
    x_axis: z
      .array(z.string())
      .optional()
      .describe("Column names for X axis (→ graph.dimensions)"),
    y_axis: z
      .array(z.string())
      .optional()
      .describe("Column names for Y axis (→ graph.metrics)"),
    stack: z
      .enum(["stacked", "normalized"])
      .optional()
      .describe("Stack type for bar/area charts"),
    show_values: z
      .boolean()
      .optional()
      .describe("Show values on chart"),
    x_axis_label: z.string().optional().describe("X axis label"),
    y_axis_label: z.string().optional().describe("Y axis label"),
    line_style: z
      .enum(["solid", "dashed", "dotted"])
      .optional()
      .describe("Line style"),
    line_interpolation: z
      .enum(["linear", "cardinal", "monotone"])
      .optional()
      .describe("Line interpolation"),
    // Pie chart
    dimension: z
      .array(z.string())
      .optional()
      .describe("Pie chart: category columns"),
    metric: z.string().optional().describe("Pie chart: value column"),
    show_legend: z.boolean().optional().describe("Show legend"),
    // Map
    map_type: z.enum(["pin", "region", "grid"]).optional(),
    map_region: z.string().optional(),
  })
  .optional()
  .describe("Visualization settings (CLI translates to Metabase format)");

export const DISPLAY_TYPES = [
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
  "boxplot",
] as const;

export const CreateQuestionInputSchema = z.object({
  name: z.string().min(1).describe("Question name"),
  database_id: z.number().int().positive().describe("Database ID"),
  sql: z.string().min(1).describe("SQL query"),
  display: z
    .enum(DISPLAY_TYPES)
    .default("table")
    .describe("Visualization type"),
  type: z
    .enum(["question", "model"])
    .default("question")
    .describe("Card type (question or model)"),
  visualization: VisualizationSchema,
  collection_id: z.number().int().positive().optional().describe("Collection ID"),
  description: z.string().optional().describe("Question description"),
});

const FilterSchema = z.object({
  field: z.string().describe("Field name (resolved to ID automatically)"),
  op: z.string().describe("Filter operation: equals, greater-than, contains, is-null, etc."),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

export const CreateSegmentInputSchema = z.object({
  name: z.string().min(1).describe("Segment name"),
  table_id: z.number().int().positive().describe("Table ID"),
  filters: z
    .array(FilterSchema)
    .min(1)
    .describe("Filter conditions using field names"),
  description: z.string().optional().describe("Segment description"),
});

const DashboardCardSchema = z.object({
  card_id: z.number().int().positive().describe("Question/card ID"),
  width: z.number().int().positive().default(6).describe("Width in grid units (max 24)"),
  height: z.number().int().positive().default(4).describe("Height in grid units"),
  row: z.number().int().min(0).optional().describe("Row position (auto-calculated if omitted)"),
  col: z.number().int().min(0).optional().describe("Column position (auto-calculated if omitted)"),
});

const DashboardFilterTargetSchema = z.object({
  card_id: z.number().int().positive().describe("Card ID to wire this filter to"),
  field: z.string().describe("Field name on the card's table (resolved automatically)"),
});

const DashboardFilterSchema = z.object({
  name: z.string().describe("Filter label shown on dashboard"),
  type: z
    .string()
    .describe("Filter type: date/range, category, number, string, id, etc."),
  targets: z
    .array(DashboardFilterTargetSchema)
    .describe("Cards and fields this filter connects to"),
});

export const CreateDashboardInputSchema = z.object({
  name: z.string().min(1).describe("Dashboard name"),
  description: z.string().optional().describe("Dashboard description"),
  collection_id: z.number().int().positive().optional().describe("Collection ID"),
  cards: z
    .array(DashboardCardSchema)
    .optional()
    .describe("Cards to place on the dashboard"),
  filters: z
    .array(DashboardFilterSchema)
    .optional()
    .describe("Dashboard filters wired to card fields"),
});

export const AddCardToDashboardInputSchema = z.object({
  dashboard_id: z.number().int().positive().describe("Dashboard ID"),
  card_id: z.number().int().positive().describe("Card/question ID to add"),
  width: z.number().int().positive().default(6),
  height: z.number().int().positive().default(4),
  filter_mappings: z
    .array(
      z.object({
        filter_name: z.string().describe("Name of existing dashboard filter"),
        field: z.string().describe("Field name to wire the filter to"),
      }),
    )
    .optional()
    .describe("Wire this card to existing dashboard filters"),
});

export const ExecuteQueryInputSchema = z.object({
  database_id: z.number().int().positive().describe("Database ID"),
  sql: z.string().min(1).describe("SQL query to execute"),
});

// ----- Schema registry for the `schema` command -----

const schemaRegistry: Record<string, z.ZodType> = {
  search: SearchInputSchema,
  "create-transform": CreateTransformInputSchema,
  "create-question": CreateQuestionInputSchema,
  "create-segment": CreateSegmentInputSchema,
  "create-dashboard": CreateDashboardInputSchema,
  "add-card-to-dashboard": AddCardToDashboardInputSchema,
  "execute-query": ExecuteQueryInputSchema,
};

export function getSchemaForCommand(
  commandName: string,
): object | undefined {
  const schema = schemaRegistry[commandName];
  if (!schema) return undefined;
  return zodToJsonSchema(schema, { name: commandName, target: "openApi3" });
}

export function listSchemaCommands(): string[] {
  return Object.keys(schemaRegistry);
}
