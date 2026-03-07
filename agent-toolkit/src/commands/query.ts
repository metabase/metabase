import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult, truncateRows } from "../core/output.js";
import { ExecuteQueryInputSchema } from "../core/schemas.js";

export function registerQueryCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("execute-query")
    .description("Execute an ad-hoc SQL query")
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema execute-query)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = ExecuteQueryInputSchema.parse(
          JSON.parse(options.json),
        );

        const apiPayload = {
          database: input.database_id,
          type: "native" as const,
          native: { query: input.sql },
        };

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "POST", path: "/api/dataset", body: apiPayload },
            ],
          });
          return;
        }

        const { data } = await ctx.client.POST("/api/dataset", {
          body: apiPayload as never,
        });

        const result = data as Record<string, unknown>;
        const resultData = result.data as Record<string, unknown>;
        const cols = (resultData?.cols as Array<Record<string, unknown>>) ?? [];
        const rows = (resultData?.rows as unknown[][]) ?? [];

        const maxRows = ctx.outputOpts.maxRows ?? 50;
        const { rows: truncatedRows, meta } = truncateRows(rows, maxRows);

        printResult({
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
