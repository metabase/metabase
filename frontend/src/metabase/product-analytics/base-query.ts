import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import { findColumn } from "./columns";
import { FLAG } from "./defaults";

const STAGE = -1;

const STRING_OPTIONS = { caseSensitive: true } as const;

const asFlag = (clause: Lib.ExpressionClause): Lib.ExpressionClause =>
  Lib.expressionClause("case", [clause, 1, 0]);

const equals = (
  column: Lib.ColumnMetadata,
  value: string,
): Lib.ExpressionClause =>
  Lib.stringFilterClause({
    operator: "=",
    column,
    values: [value],
    options: STRING_OPTIONS,
  });

const startsWith = (
  column: Lib.ColumnMetadata,
  value: string,
): Lib.ExpressionClause =>
  Lib.stringFilterClause({
    operator: "starts-with",
    column,
    values: [value],
    options: STRING_OPTIONS,
  });

export type BuiltBaseQuery = {
  query: Lib.Query;
  databaseId: number;
};

/**
 * Lib query on pa_events_resolved: relative date filter, named 0/1 flag
 * expressions, and an explicit field list so compiled aliases stay stable.
 *
 * Flags are `case(filter, 1, 0)` rather than raw boolean expressions — Lib
 * custom expressions are typed, and a filter clause as an expression is the
 * spike we may revisit. 0/1 also lets `countIf(ev_n)` work in ClickHouse.
 */
export const buildBaseQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
  rangeDays: number,
): BuiltBaseQuery => {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (!tableMetadata) {
    throw new Error(`Table ${String(tableId)} is not in metadata yet`);
  }

  let query = Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);

  const createdAt = findColumn(query, "created_at");
  query = Lib.filter(
    query,
    STAGE,
    Lib.relativeDateFilterClause({
      column: createdAt,
      value: -rangeDays,
      unit: "day",
      offsetValue: null,
      offsetUnit: null,
      options: {},
    }),
  );

  const urlPath = findColumn(query, "url_path");
  const eventName = findColumn(query, "event_name");

  const flags: { name: string; clause: Lib.ExpressionClause }[] = [
    { name: FLAG.pricing, clause: asFlag(equals(urlPath, "/pricing")) },
    { name: FLAG.trial, clause: asFlag(equals(eventName, "trial_started")) },
    {
      name: FLAG.checkout,
      clause: asFlag(equals(eventName, "checkout_completed")),
    },
    { name: FLAG.signup, clause: asFlag(equals(eventName, "signup")) },
    {
      name: FLAG.active,
      clause: asFlag(
        Lib.expressionClause("or", [
          startsWith(urlPath, "/app"),
          equals(eventName, "report_created"),
          equals(eventName, "invite_sent"),
          equals(eventName, "checkout_completed"),
        ]),
      ),
    },
    { name: FLAG.invite, clause: asFlag(equals(eventName, "invite_sent")) },
    { name: FLAG.error, clause: asFlag(equals(eventName, "error")) },
    { name: FLAG.report, clause: asFlag(equals(eventName, "report_created")) },
  ];

  for (const flag of flags) {
    query = Lib.expression(query, STAGE, flag.name, flag.clause);
  }

  const wanted = [
    "person_id",
    "session_id",
    "event_id",
    "created_at",
    "event_name",
    "url_path",
    ...flags.map((flag) => flag.name),
  ];
  const selected = wanted.map((name) => findColumn(query, name));
  query = Lib.withFields(query, STAGE, selected);

  const databaseId = Lib.databaseID(query);
  if (databaseId === null) {
    throw new Error("Base query has no database");
  }

  return { query, databaseId };
};
