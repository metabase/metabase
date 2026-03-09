import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult, formatQueryResult } from "../core/output.js";
import { CliError, validatePositiveInt } from "../core/validation.js";
import { fetchMetadataBundle } from "../core/metadata.js";
import { loadCljsModule } from "../core/cljs-bridge.js";

export function registerConstructQueryCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("construct-query")
    .description(
      "Construct an MBQL query by evaluating Clojure code with metabase.lib functions. Use --run to also execute.",
    )
    .requiredOption(
      "--database-id <id>",
      "Database ID",
    )
    .requiredOption(
      "--clj <code>",
      "Clojure code string using metabase.lib functions (query, table, field, filter, aggregate, breakout, etc.)",
    )
    .option(
      "--run",
      "Execute the constructed query and return results instead of the MBQL JSON",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as {
          databaseId: string;
          clj: string;
          run?: boolean;
        };
        const dbId = validatePositiveInt(options.databaseId, "database-id");

        if (ctx.dryRun) {
          const apiCalls = [
            {
              method: "GET",
              path: `/api/database/${dbId}/metadata`,
              description: "Fetch database metadata (tables + fields)",
            },
          ];
          if (options.run) {
            apiCalls.push({
              method: "POST",
              path: "/api/dataset",
              description: "Execute the constructed MBQL query",
            });
          }
          printResult({
            dry_run: true,
            api_calls: apiCalls,
            clj_code: options.clj,
            note: options.run
              ? "Code will be evaluated and the query executed"
              : "Code will be evaluated with metabase.lib functions after metadata fetch",
          });
          return;
        }

        // 1. Load CLJS module
        const cljs = await loadCljsModule();

        // 2. Fetch metadata from API
        const metadata = await fetchMetadataBundle(ctx.client, dbId);

        // 3. Evaluate Clojure code
        let result: unknown;
        try {
          result = cljs.evaluate(options.clj, dbId, metadata);
        } catch (e) {
          throw new CliError("query_construction_error", {
            message: e instanceof Error ? e.message : String(e),
            hint: "Check your Clojure code syntax and function usage. Available functions: query, table, field, filter, aggregate, breakout, order-by, limit, asc, desc, and all metabase.lib operators.",
          });
        }

        // 4. If --run, execute the query; otherwise return MBQL JSON
        if (options.run) {
          const apiPayload = {
            ...(result as Record<string, unknown>),
            database: dbId,
          };

          const { data } = await ctx.client.POST("/api/dataset", {
            body: apiPayload as never,
          });

          const maxRows = ctx.outputOpts.maxRows ?? 50;
          printResult(
            formatQueryResult(data as Record<string, unknown>, maxRows),
          );
        } else {
          printResult(result);
        }
      }),
    );
}
