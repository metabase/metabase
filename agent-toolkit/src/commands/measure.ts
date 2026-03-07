import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";
import { CreateMeasureInputSchema } from "../core/schemas.js";
import { validatePositiveInt } from "../core/validation.js";

export function registerMeasureCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("create-measure")
    .description(
      "Create a reusable measure (aggregation expression) on a table",
    )
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema create-measure)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = CreateMeasureInputSchema.parse(
          JSON.parse(options.json),
        );

        const apiPayload = {
          name: input.name,
          table_id: input.table_id,
          definition: input.definition,
          ...(input.description && { description: input.description }),
        };

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "POST", path: "/api/measure", body: apiPayload },
            ],
          });
          return;
        }

        const { data } = await ctx.client.POST("/api/measure", {
          body: apiPayload as never,
        });

        const result = data as Record<string, unknown>;
        printResult({
          id: result.id,
          name: result.name,
          table_id: result.table_id,
        });
      }),
    );

  program
    .command("list-measures")
    .description("List all measures")
    .action(
      withContext(async (ctx) => {
        const { data } = await ctx.client.GET("/api/measure");

        const raw = data as Record<string, unknown>[];
        const compact = raw.map((m) => ({
          id: m.id,
          name: m.name,
          table_id: m.table_id,
          description: m.description ?? null,
        }));

        printResult(compact, ctx.outputOpts);
      }),
    );

  program
    .command("get-measure <id>")
    .description("Get measure details")
    .action(
      withContext(async (ctx, id: unknown) => {
        const measureId = validatePositiveInt(id, "measure id");
        const { data } = await ctx.client.GET(
          `/api/measure/${measureId}`,
        );
        printResult(data, ctx.outputOpts);
      }),
    );

  program
    .command("update-measure <id>")
    .description("Update a measure")
    .requiredOption("--json <payload>", "JSON input with fields to update")
    .action(
      withContext(async (ctx, id: unknown, opts: unknown) => {
        const measureId = validatePositiveInt(id, "measure id");
        const options = opts as { json: string };
        const input = JSON.parse(options.json) as Record<string, unknown>;

        const apiPayload: Record<string, unknown> = {
          revision_message:
            (input.revision_message as string) ?? "Updated via CLI",
        };
        if (input.name) apiPayload.name = input.name;
        if (input.description !== undefined)
          apiPayload.description = input.description;
        if (input.definition) apiPayload.definition = input.definition;

        const { data } = await ctx.client.PUT(
          `/api/measure/${measureId}`,
          { body: apiPayload as never },
        );

        const result = data as Record<string, unknown>;
        printResult({ id: result.id, name: result.name });
      }),
    );
}
