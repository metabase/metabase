import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { printResult } from "../core/output.js";
import { validatePositiveInt } from "../core/validation.js";

export function registerFieldCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("get-field <id>")
    .description(
      "Get field metadata including fingerprint (min/max/avg for numbers, date ranges for dates, distinct count)",
    )
    .action(
      withContext(async (ctx, id: unknown) => {
        const fieldId = validatePositiveInt(id, "field id");

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "GET", path: `/api/field/${fieldId}` },
            ],
          });
          return;
        }

        const { data } = await ctx.client.GET(`/api/field/${fieldId}`);

        const raw = data as Record<string, unknown>;
        const fingerprint = raw.fingerprint as Record<string, unknown> | null;
        const global = fingerprint?.global as Record<string, unknown> | null;
        const typeInfo = fingerprint?.type as Record<string, unknown> | null;

        // Build a compact fingerprint summary
        const stats: Record<string, unknown> = {};
        if (global) {
          if (global["distinct-count"] != null)
            stats.distinct_count = global["distinct-count"];
          if (global["nil%"] != null) stats.null_percent = global["nil%"];
        }
        if (typeInfo) {
          const numInfo = typeInfo["type/Number"] as Record<
            string,
            unknown
          > | null;
          if (numInfo) {
            stats.min = numInfo.min;
            stats.max = numInfo.max;
            stats.avg = numInfo.avg;
            if (numInfo.q1 != null) stats.q1 = numInfo.q1;
            if (numInfo.q3 != null) stats.q3 = numInfo.q3;
            if (numInfo.sd != null) stats.sd = numInfo.sd;
          }
          const dateInfo = typeInfo["type/DateTime"] as Record<
            string,
            unknown
          > | null;
          if (dateInfo) {
            stats.earliest = dateInfo.earliest;
            stats.latest = dateInfo.latest;
          }
          const textInfo = typeInfo["type/Text"] as Record<
            string,
            unknown
          > | null;
          if (textInfo) {
            stats.average_length = textInfo["average-length"];
          }
        }

        printResult(
          {
            id: raw.id,
            name: raw.name,
            display_name: raw.display_name,
            table_id: raw.table_id,
            base_type: raw.base_type,
            effective_type: raw.effective_type,
            semantic_type: raw.semantic_type,
            has_field_values: raw.has_field_values,
            fk_target_field_id: raw.fk_target_field_id ?? null,
            description: raw.description ?? null,
            ...(Object.keys(stats).length > 0 && { fingerprint: stats }),
          },
          ctx.outputOpts,
        );
      }),
    );

  program
    .command("get-field-values <id>")
    .description(
      "Get distinct values for a field — use to discover valid filter values (e.g., status codes, categories)",
    )
    .action(
      withContext(async (ctx, id: unknown) => {
        const fieldId = validatePositiveInt(id, "field id");

        if (ctx.dryRun) {
          printResult({
            dry_run: true,
            api_calls: [
              { method: "GET", path: `/api/field/${fieldId}/values` },
            ],
          });
          return;
        }

        const { data } = await ctx.client.GET(
          `/api/field/${fieldId}/values`,
        );

        const raw = data as Record<string, unknown>;
        const rawValues = (raw.values as unknown[][]) ?? [];

        // Flatten 1-tuples to plain values, keep 2-tuples as [value, display_name]
        const values = rawValues.map((tuple) =>
          tuple.length === 1 ? tuple[0] : tuple,
        );

        printResult(
          {
            field_id: raw.field_id,
            values,
            has_more_values: raw.has_more_values ?? false,
          },
          ctx.outputOpts,
        );
      }),
    );
}
