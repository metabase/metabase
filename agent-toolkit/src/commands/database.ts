import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";
import { validatePositiveInt } from "../core/validation.js";

export function registerDatabaseCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("list-databases")
    .description("List all databases")
    .option("--include <value>", 'Include related data: "tables"')
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { include?: string };
        const { data } = await ctx.client.GET("/api/database", {
          params: { query: { include: options.include } },
        });

        const raw = data as { data?: unknown[] } | unknown[];
        const databases = Array.isArray(raw)
          ? raw
          : ((raw as Record<string, unknown>)?.data ?? []);

        const compact = (databases as Record<string, unknown>[]).map((db) => ({
          id: db.id,
          name: db.name,
          engine: db.engine,
          ...(db.tables
            ? {
                tables: (db.tables as Record<string, unknown>[]).map((t) => ({
                  id: t.id,
                  name: t.name,
                  schema: t.schema,
                })),
              }
            : {}),
        }));

        printResult(compact, ctx.outputOpts);
      }),
    );

  program
    .command("get-database <id>")
    .description("Get database schema — tables, fields, types")
    .action(
      withContext(async (ctx, id: unknown) => {
        const dbId = validatePositiveInt(id, "database id");
        const { data } = await ctx.client.GET(
          `/api/database/${dbId}/metadata`,
        );

        const raw = data as Record<string, unknown>;
        const tables = (raw?.tables as Record<string, unknown>[]) ?? [];

        const compact = {
          id: raw.id,
          name: raw.name,
          engine: raw.engine,
          tables: tables.map((t) => ({
            id: t.id,
            name: t.name,
            schema: t.schema,
            display_name: t.display_name,
            fields: ((t.fields as Record<string, unknown>[]) ?? []).map(
              (f) => ({
                id: f.id,
                name: f.name,
                display_name: f.display_name,
                base_type: f.base_type,
                semantic_type: f.semantic_type,
              }),
            ),
          })),
        };

        printResult(compact, ctx.outputOpts);
      }),
    );
}
