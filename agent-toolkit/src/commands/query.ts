import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult, formatQueryResult } from "../core/output.js";
import { ExecuteQueryInputSchema } from "../core/schemas.js";

export function registerQueryCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("execute-query")
    .description("Execute an ad-hoc SQL or MBQL query")
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

        const apiPayload = input.sql
          ? {
              database: input.database_id,
              type: "native" as const,
              native: { query: input.sql },
            }
          : {
              ...(input.query as Record<string, unknown>),
              database: input.database_id,
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

        const maxRows = ctx.outputOpts.maxRows ?? 50;
        printResult(
          formatQueryResult(data as Record<string, unknown>, maxRows),
        );
      }),
    );
}
