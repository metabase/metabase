import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";
import { validatePositiveInt } from "../core/validation.js";

export function registerTableCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("get-table <id>")
    .description("Get table details — fields with names, types, and FKs")
    .action(
      withContext(async (ctx, id: unknown) => {
        const tableId = validatePositiveInt(id, "table id");
        const { data } = await ctx.client.GET(
          `/api/table/${tableId}/query_metadata`,
        );

        const raw = data as Record<string, unknown>;
        const fields = (raw?.fields as Record<string, unknown>[]) ?? [];

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
            fk_target_field_id: f.fk_target_field_id ?? null,
          })),
        };

        printResult(compact, ctx.outputOpts);
      }),
    );
}
