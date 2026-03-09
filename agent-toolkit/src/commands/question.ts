import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult, truncateRows } from "../core/output.js";
import { CreateQuestionInputSchema } from "../core/schemas.js";
import { validatePositiveInt } from "../core/validation.js";

/**
 * Translate simplified visualization options to Metabase visualization_settings.
 */
function buildVisualizationSettings(
  viz: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!viz) return {};
  const settings: Record<string, unknown> = {};

  if (viz.x_axis) settings["graph.dimensions"] = viz.x_axis;
  if (viz.y_axis) settings["graph.metrics"] = viz.y_axis;
  if (viz.stack) settings["stackable.stack_type"] = viz.stack;
  if (viz.show_values !== undefined)
    settings["graph.show_values"] = viz.show_values;
  if (viz.x_axis_label) settings["graph.x_axis.title_text"] = viz.x_axis_label;
  if (viz.y_axis_label) settings["graph.y_axis.title_text"] = viz.y_axis_label;
  if (viz.line_style) settings["line.style"] = viz.line_style;
  if (viz.line_interpolation)
    settings["line.interpolate"] = viz.line_interpolation;

  // Pie chart
  if (viz.dimension) settings["pie.dimension"] = viz.dimension;
  if (viz.metric) settings["pie.metric"] = viz.metric;
  if (viz.show_legend !== undefined)
    settings["pie.show_legend"] = viz.show_legend;

  // Map
  if (viz.map_type) settings["map.type"] = viz.map_type;
  if (viz.map_region) settings["map.region"] = viz.map_region;

  return settings;
}

export function registerQuestionCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("create-question")
    .description(
      "Create a saved question (card) from SQL with visualization settings",
    )
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema create-question)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = CreateQuestionInputSchema.parse(
          JSON.parse(options.json),
        );

        const vizSettings = buildVisualizationSettings(
          input.visualization as Record<string, unknown> | undefined,
        );

        const datasetQuery = input.sql
          ? {
              type: "native" as const,
              database: input.database_id,
              native: { query: input.sql },
            }
          : {
              ...(input.query as Record<string, unknown>),
              database: input.database_id,
            };

        const apiPayload = {
          name: input.name,
          type: input.type,
          dataset_query: datasetQuery,
          display: input.display,
          visualization_settings: vizSettings,
          ...(input.collection_id && { collection_id: input.collection_id }),
          ...(input.description && { description: input.description }),
        };

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "POST", path: "/api/card", body: apiPayload },
            ],
          });
          return;
        }

        const { data } = await ctx.client.POST("/api/card", {
          body: apiPayload as never,
        });

        const result = data as Record<string, unknown>;
        printResult({
          id: result.id,
          name: result.name,
          display: result.display,
          type: result.type,
        });
      }),
    );

  program
    .command("update-question <id>")
    .description("Update a question's SQL, display, or visualization")
    .requiredOption("--json <payload>", "JSON input with fields to update")
    .action(
      withContext(async (ctx, id: unknown, opts: unknown) => {
        const cardId = validatePositiveInt(id, "question id");
        const options = opts as { json: string };
        const input = JSON.parse(options.json) as Record<string, unknown>;

        const apiPayload: Record<string, unknown> = {};
        if (input.name) apiPayload.name = input.name;
        if (input.description !== undefined)
          apiPayload.description = input.description;
        if (input.display) apiPayload.display = input.display;
        if (input.sql && input.database_id) {
          apiPayload.dataset_query = {
            type: "native",
            database: input.database_id,
            native: { query: input.sql },
          };
        }
        if (input.visualization) {
          apiPayload.visualization_settings = buildVisualizationSettings(
            input.visualization as Record<string, unknown>,
          );
        }

        const { data } = await ctx.client.PUT(`/api/card/${cardId}`, {
          body: apiPayload as never,
        });

        const result = data as Record<string, unknown>;
        printResult({ id: result.id, name: result.name });
      }),
    );

  program
    .command("run-question <id>")
    .description("Run a saved question and return sample results")
    .option("--max-rows <n>", "Max rows to return (default: 10)", "10")
    .action(
      withContext(async (ctx, id: unknown, opts: unknown) => {
        const cardId = validatePositiveInt(id, "question id");
        const options = opts as { maxRows?: string };
        const maxRows = options.maxRows ? parseInt(options.maxRows, 10) : 10;

        const { data } = await ctx.client.POST(
          `/api/card/${cardId}/query`,
          {},
        );

        const result = data as Record<string, unknown>;
        const resultData = result.data as Record<string, unknown>;
        const cols =
          (resultData?.cols as Array<Record<string, unknown>>) ?? [];
        const rows = (resultData?.rows as unknown[][]) ?? [];

        const { rows: truncatedRows, meta } = truncateRows(rows, maxRows);

        printResult({
          card_id: cardId,
          status: result.status,
          columns: cols.map((c) => ({
            name: c.name,
            display_name: c.display_name,
            base_type: c.base_type,
          })),
          rows: truncatedRows,
          row_count: result.row_count,
          running_time: result.running_time,
          _meta: meta,
        });
      }),
    );
}
