/**
 * Writes each analysis variant as both queries: the SQL the string planners
 * build, and the MBQL query the MBQL planners build. The REPL runs both and
 * compares their rows (`dev.product-analytics.mbql-diff`). Variants without
 * an MBQL planner yet are written with `notPorted`.
 *
 * Usage: bun run dev/product-analytics/mbql-variants.ts [--only habit/]
 */

import { mkdir } from "node:fs/promises";

import { buildSql } from "../../frontend/src/metabase/product-analytics/build-sql";
import type { MbqlBase } from "../../frontend/src/metabase/product-analytics/mbql/analyses/base";
import { buildAnalysisMbql } from "../../frontend/src/metabase/product-analytics/mbql/build";
import {
  type BaseType,
  type Clause,
  clause,
  expression,
  expressionRef,
  field,
} from "../../frontend/src/metabase/product-analytics/mbql/clause";
import { NotPortedError } from "../../frontend/src/metabase/product-analytics/mbql/query";
import type { AnalysisSpec } from "../../frontend/src/metabase/product-analytics/spec/types";
import {
  IN_RANGE_FLAG,
  getLookbackDays,
} from "../../frontend/src/metabase/product-analytics/sql/analyses/lookback";

import { EVENTS_BASE_SQL, RANGE, VARIANTS, baseColumnsFor } from "./variants";

const CLICKHOUSE_DATABASE = 2;
const EVENTS_TABLE = 211;
const IDENTITIES_TABLE = 213;
const OUT = `${import.meta.dir}/.mbql`;

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : undefined;

const text = (name: string) => field(name, "type/Text");
const createdAt = () => field("created_at", "type/DateTime");
const flag = (name: string, condition: Clause) =>
  expression(name, clause("case", [[condition, 1]], 0));
const isEvent = (...names: string[]) =>
  clause("=", text("event_name"), ...names);

/** The event table columns `EVENTS_BASE_SQL` keeps, and their types. */
const KEPT_COLUMNS = new Map<string, BaseType>([
  ["person__first_seen_at", "type/DateTime"],
  ["person_id", "type/Text"],
  ["session_id", "type/Text"],
  ["event_id", "type/UUID"],
  ["created_at", "type/DateTime"],
  ["event_name", "type/Text"],
  ["url_path", "type/Text"],
  ["country", "type/Text"],
]);

/** The same events and flags as `EVENTS_BASE_SQL`, as the query builder would make them. */
const baseFor = (spec: AnalysisSpec): MbqlBase => {
  const columns = baseColumnsFor(spec);
  const flags = [
    flag("ev_1", clause("=", text("url_path"), "/pricing")),
    flag("ev_2", isEvent("trial_started")),
    flag("ev_3", isEvent("checkout_completed")),
    flag("ev_4", isEvent("signup")),
    flag(
      "ev_5",
      clause(
        "or",
        clause("starts-with", text("url_path"), "/app"),
        isEvent("report_created", "invite_sent", "checkout_completed"),
      ),
    ),
    flag("ev_6", isEvent("invite_sent")),
    flag("ev_7", isEvent("error")),
    flag("ev_8", isEvent("report_created")),
    flag("ev_9", isEvent("integration_connected")),
    ...(getLookbackDays(spec) > 0
      ? [flag(IN_RANGE_FLAG, clause(">=", createdAt(), RANGE.rangeStart))]
      : []),
  ];
  return {
    database: CLICKHOUSE_DATABASE,
    stages: [
      {
        "lib/type": "mbql.stage/mbql",
        "source-table": EVENTS_TABLE,
        filters: [
          clause(">=", createdAt(), RANGE.start),
          clause("<", createdAt(), RANGE.end),
        ],
        expressions: flags,
        fields: [
          ...[...KEPT_COLUMNS].map(([name, baseType]) => field(name, baseType)),
          ...flags.map(([, opts]) =>
            expressionRef(String(opts["lib/expression-name"]), "type/Integer"),
          ),
        ],
      },
    ],
    columns: columns.columns,
    columnTypes: {
      timestamp: "type/DateTime",
      person: "type/Text",
      session: "type/Text",
      event_id: "type/UUID",
      event_name: "type/Text",
      url_path: "type/Text",
    },
    flags: columns.flags,
    extraColumns: columns.extraColumns.map(({ as, alias }) => ({
      as,
      column: alias,
      baseType: KEPT_COLUMNS.get(alias) ?? "type/Text",
    })),
    ...(columns.peopleSegments !== undefined
      ? {
          peopleSegments: {
            stages: [
              {
                "lib/type": "mbql.stage/mbql",
                "source-table": IDENTITIES_TABLE,
                expressions: [
                  flag(
                    "seg_1",
                    clause("=", text("plan"), "starter", "pro", "business"),
                  ),
                ],
                fields: [
                  text("person_id"),
                  expressionRef("seg_1", "type/Integer"),
                ],
              },
            ],
            primaryKey: { name: "person_id", baseType: "type/Text" },
            flags: ["seg_1"],
            required: [],
          },
        }
      : {}),
  };
};

type Emitted = {
  name: string;
  sql: string;
  mbql?: unknown;
  notPorted?: string;
  error?: string;
};

const emitted: Emitted[] = Object.entries(VARIANTS)
  .filter(([name]) => only === undefined || name.startsWith(only))
  .map(([name, spec]) => {
    const sql = buildSql(spec, EVENTS_BASE_SQL, baseColumnsFor(spec)).sql;
    try {
      return { name, sql, mbql: buildAnalysisMbql(spec, baseFor(spec)) };
    } catch (error) {
      if (error instanceof NotPortedError) {
        return { name, sql, notPorted: error.message };
      }
      return { name, sql, error: String(error) };
    }
  });

await mkdir(OUT, { recursive: true });
await Bun.write(`${OUT}/variants.json`, JSON.stringify(emitted, null, 2));
const ported = emitted.filter((variant) => variant.mbql !== undefined).length;
process.stdout.write(
  `${emitted.length} variants, ${ported} with MBQL, to ${OUT}/variants.json\n`,
);
for (const { name, error } of emitted.filter((variant) => variant.error)) {
  process.stdout.write(`  ${name}: ${error}\n`);
}
