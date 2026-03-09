import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { FieldResolver } from "../core/field-resolver.js";
import { printResult } from "../core/output.js";
import { CreateSegmentInputSchema } from "../core/schemas.js";
import { validatePositiveInt } from "../core/validation.js";

/** Map simplified filter ops to MBQL operators */
const OP_MAP: Record<string, string> = {
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
  "is-not-empty": "not-empty",
};

/**
 * Build an MBQL filter clause from simplified filter input.
 */
async function buildMbqlFilter(
  resolver: FieldResolver,
  tableId: number,
  filters: Array<{
    field: string;
    op: string;
    value?: string | number | boolean;
    values?: (string | number)[];
  }>,
): Promise<unknown[]> {
  if (filters.length === 1) {
    return await buildSingleFilter(resolver, tableId, filters[0]);
  }
  // Multiple filters → AND clause
  const clauses = await Promise.all(
    filters.map((f) => buildSingleFilter(resolver, tableId, f)),
  );
  return ["and", ...clauses];
}

async function buildSingleFilter(
  resolver: FieldResolver,
  tableId: number,
  filter: {
    field: string;
    op: string;
    value?: string | number | boolean;
    values?: (string | number)[];
  },
): Promise<unknown[]> {
  const fieldId = await resolver.resolve(tableId, filter.field);
  const mbqlOp = OP_MAP[filter.op] ?? filter.op;
  const fieldRef = ["field", fieldId, null];

  // Existence operators (no value)
  if (
    mbqlOp === "is-null" ||
    mbqlOp === "not-null" ||
    mbqlOp === "is-empty" ||
    mbqlOp === "not-empty"
  ) {
    return [mbqlOp, fieldRef];
  }

  if (filter.values) {
    return [mbqlOp, fieldRef, ...filter.values];
  }

  return [mbqlOp, fieldRef, filter.value];
}

export function registerSegmentCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("create-segment")
    .description("Create a reusable filter (segment) on a table")
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema create-segment)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = CreateSegmentInputSchema.parse(
          JSON.parse(options.json),
        );

        const resolver = new FieldResolver(ctx.client);
        const mbqlFilter = await buildMbqlFilter(
          resolver,
          input.table_id,
          input.filters,
        );

        const apiPayload = {
          name: input.name,
          table_id: input.table_id,
          definition: {
            filter: mbqlFilter,
          },
          ...(input.description && { description: input.description }),
        };

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "POST", path: "/api/segment", body: apiPayload },
            ],
          });
          return;
        }

        const { data } = await ctx.client.POST("/api/segment", {
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
    .command("update-segment <id>")
    .description("Update a segment")
    .requiredOption("--json <payload>", "JSON input with fields to update")
    .action(
      withContext(async (ctx, id: unknown, opts: unknown) => {
        const segmentId = validatePositiveInt(id, "segment id");
        const options = opts as { json: string };
        const input = JSON.parse(options.json) as Record<string, unknown>;

        const apiPayload: Record<string, unknown> = {
          revision_message: (input.revision_message as string) ?? "Updated via CLI",
        };
        if (input.name) apiPayload.name = input.name;
        if (input.description !== undefined)
          apiPayload.description = input.description;

        if (input.filters && input.table_id) {
          const resolver = new FieldResolver(ctx.client);
          const mbqlFilter = await buildMbqlFilter(
            resolver,
            input.table_id as number,
            input.filters as Array<{
              field: string;
              op: string;
              value?: string | number | boolean;
              values?: (string | number)[];
            }>,
          );
          apiPayload.definition = { filter: mbqlFilter };
        }

        const { data } = await ctx.client.PUT(`/api/segment/${segmentId}`, {
          body: apiPayload as never,
        });

        const result = data as Record<string, unknown>;
        printResult({ id: result.id, name: result.name });
      }),
    );
}
