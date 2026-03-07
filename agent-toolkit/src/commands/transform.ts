import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";
import { CreateTransformInputSchema } from "../core/schemas.js";
import { CliError, validatePositiveInt } from "../core/validation.js";

export function registerTransformCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("create-transform")
    .description("Create a SQL or MBQL transform. Use --run to execute immediately.")
    .requiredOption("--json <payload>", "JSON input (see: schema create-transform)")
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = CreateTransformInputSchema.parse(
          JSON.parse(options.json),
        );

        const sourceQuery = input.sql
          ? {
              database: input.database_id,
              type: "native" as const,
              native: { query: input.sql },
            }
          : {
              ...(input.query as Record<string, unknown>),
              database: input.database_id,
            };

        const apiPayload = {
          name: input.name,
          description: input.description ?? null,
          source: {
            type: "query" as const,
            query: sourceQuery,
          },
          target: {
            type: "table" as const,
            name: input.target_table,
            ...(input.target_schema && { schema: input.target_schema }),
            ...(input.target_database_id && {
              database: input.target_database_id,
            }),
          },
        };

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "POST", path: "/api/transform", body: apiPayload },
              ...(input.run
                ? [
                    {
                      method: "POST",
                      path: "/api/transform/{id}/run",
                      note: "Would poll for completion",
                    },
                  ]
                : []),
            ],
          });
          return;
        }

        const { data: transform } = await ctx.client.POST("/api/transform", {
          body: apiPayload as never,
        });

        const result = transform as Record<string, unknown>;

        if (input.run && result.id) {
          const transformId = result.id as number;
          const { data: runResult } = await ctx.client.POST(
            `/api/transform/${transformId}/run`,
          );

          const run = runResult as { run_id?: number };

          if (run.run_id) {
            // Poll until complete
            const finalStatus = await pollTransformRun(
              ctx,
              run.run_id,
            );
            printResult({
              transform: { id: result.id, name: result.name },
              run: finalStatus,
            });
            return;
          }
        }

        printResult({
          id: result.id,
          name: result.name,
          source_type: result.source_type,
        });
      }),
    );

  program
    .command("get-transform <id>")
    .description("Get transform details — name, SQL query, target table, run status")
    .action(
      withContext(async (ctx, id: unknown) => {
        const transformId = validatePositiveInt(id, "transform id");
        const { data } = await ctx.client.GET(
          `/api/transform/${transformId}`,
        );

        const raw = data as Record<string, unknown>;
        const source = raw.source as Record<string, unknown> | undefined;
        const sourceQuery = source?.query as Record<string, unknown> | undefined;
        const nativeQuery = sourceQuery?.native as Record<string, unknown> | undefined;
        const target = raw.target as Record<string, unknown> | undefined;
        const lastRun = raw.last_run as Record<string, unknown> | null;

        const compact = {
          id: raw.id,
          name: raw.name,
          description: raw.description,
          database_id: sourceQuery?.database ?? null,
          sql: nativeQuery?.query ?? null,
          target_table: target?.name ?? null,
          target_schema: target?.schema ?? null,
          last_run_status: lastRun?.status ?? null,
          last_run_at: lastRun?.started_at ?? null,
        };

        printResult(compact, ctx.outputOpts);
      }),
    );

  program
    .command("list-transforms")
    .description("List all transforms with latest run status")
    .action(
      withContext(async (ctx) => {
        const { data } = await ctx.client.GET("/api/transform");

        const raw = data as Record<string, unknown>[];
        const compact = raw.map((t) => ({
          id: t.id,
          name: t.name,
          source_type: t.source_type,
          last_run_status: (t.last_run as Record<string, unknown> | null)
            ?.status ?? null,
        }));

        printResult(compact, ctx.outputOpts);
      }),
    );

  program
    .command("get-transform-run <runId>")
    .description("Check transform execution status")
    .action(
      withContext(async (ctx, runId: unknown) => {
        const id = validatePositiveInt(runId, "run id");
        const { data } = await ctx.client.GET(
          `/api/transform/run/${id}`,
        );
        printResult(data, ctx.outputOpts);
      }),
    );

  program
    .command("update-transform <id>")
    .description("Update a transform")
    .requiredOption("--json <payload>", "JSON input with fields to update")
    .action(
      withContext(async (ctx, id: unknown, opts: unknown) => {
        const transformId = validatePositiveInt(id, "transform id");
        const options = opts as { json: string };
        const input = JSON.parse(options.json);

        // Build API payload from simplified input
        const apiPayload: Record<string, unknown> = {};
        if (input.name) apiPayload.name = input.name;
        if (input.description !== undefined)
          apiPayload.description = input.description;
        if (input.sql || input.query) {
          const dbId = input.database_id;
          if (!dbId) {
            throw new CliError("missing_parameter", {
              message:
                "database_id is required when updating the source query",
              hint: "Include database_id in the JSON payload",
            });
          }
          const sourceQuery = input.sql
            ? {
                database: dbId,
                type: "native",
                native: { query: input.sql },
              }
            : {
                ...input.query,
                database: dbId,
              };
          apiPayload.source = {
            type: "query",
            query: sourceQuery,
          };
        }
        if (input.target_table) {
          apiPayload.target = {
            type: "table",
            name: input.target_table,
            ...(input.target_schema && { schema: input.target_schema }),
          };
        }

        const { data } = await ctx.client.PUT(
          `/api/transform/${transformId}`,
          { body: apiPayload as never },
        );

        const result = data as Record<string, unknown>;
        printResult({ id: result.id, name: result.name });
      }),
    );
}

async function pollTransformRun(
  ctx: GlobalContext,
  runId: number,
  maxWaitMs = 300_000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  let delayMs = 1000;

  while (Date.now() - start < maxWaitMs) {
    const { data } = await ctx.client.GET(
      `/api/transform/run/${runId}`,
    );
    const run = data as Record<string, unknown>;
    const status = run.status as string;

    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "timeout" ||
      status === "canceled"
    ) {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 1.5, 10_000);
  }

  return { status: "polling_timeout", run_id: runId };
}
