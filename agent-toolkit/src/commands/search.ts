import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";

export function registerSearchCommand(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("search <query>")
    .description("Search for tables, dashboards, cards, metrics, segments")
    .option(
      "--models <models>",
      "Comma-separated entity types to filter (table,dashboard,card,metric,segment)",
    )
    .action(
      withContext(async (ctx, query: unknown, opts: unknown) => {
        const options = opts as { models?: string };
        const params: Record<string, unknown> = {
          q: String(query),
        };
        // Metabase expects repeated query params: ?models=card&models=dashboard
        if (options.models) {
          params.models = options.models.split(",").map((m) => m.trim());
        }

        const { data } = await ctx.client.GET("/api/search", {
          params: { query: params },
        });

        // Compact output: only key fields for context window discipline
        const raw = data as {
          data?: Array<Record<string, unknown>>;
          total?: number;
        };
        const items = (raw.data ?? (Array.isArray(raw) ? raw : [])).map(
          (item: Record<string, unknown>) => ({
            id: item.id,
            name: item.name,
            model: item.model,
            description: item.description,
            database_id: item.database_id,
            table_id: item.table_id,
          }),
        );

        printResult(
          {
            results: items,
            _meta: { total_count: raw.total ?? items.length },
          },
          ctx.outputOpts,
        );
      }),
    );
}
