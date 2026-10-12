import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { ColumnRoles } from "../columns";
import { findColumn } from "../find-column";

import type { EventDefinition } from "./types";

const STRING_OPTIONS = { caseSensitive: true } as const;

const requireColumn = (
  query: Lib.Query,
  name: string | null,
  roleName: string,
): Lib.ColumnMetadata => {
  if (name === null) {
    throw new Error(
      t`To use this event, pick a column for ${roleName} in Advanced settings.`,
    );
  }
  return findColumn(query, name);
};

const urlPathEquals =
  (path: string) => (query: Lib.Query, columns: ColumnRoles) =>
    Lib.stringFilterClause({
      operator: "=",
      column: requireColumn(query, columns.url_path, t`URL path`),
      values: [path],
      options: STRING_OPTIONS,
    });

const eventNameIn =
  (...names: string[]) =>
  (query: Lib.Query, columns: ColumnRoles) =>
    Lib.stringFilterClause({
      operator: "=",
      column: requireColumn(query, columns.event_name, t`event name`),
      values: names,
      options: STRING_OPTIONS,
    });

/**
 * Stand-in for saved event definitions, matching the seeded data in
 * `pa_events_resolved`. Names are data, like a saved definition's name, so
 * they aren't translated.
 */
export const SAVED_EVENTS: readonly EventDefinition[] = [
  {
    id: "pricing",
    name: "Viewed pricing",
    getFilter: urlPathEquals("/pricing"),
  },
  {
    id: "trial",
    name: "Started trial",
    getFilter: eventNameIn("trial_started"),
  },
  {
    id: "checkout",
    name: "Purchased",
    getFilter: eventNameIn("checkout_completed"),
  },
  { id: "signup", name: "Signed up", getFilter: eventNameIn("signup") },
  {
    id: "active",
    name: "Was active",
    getFilter: (query, columns) =>
      Lib.expressionClause("or", [
        Lib.stringFilterClause({
          operator: "starts-with",
          column: requireColumn(query, columns.url_path, t`URL path`),
          values: ["/app"],
          options: STRING_OPTIONS,
        }),
        eventNameIn(
          "report_created",
          "invite_sent",
          "checkout_completed",
        )(query, columns),
      ]),
  },
  {
    id: "invite",
    name: "Sent an invite",
    getFilter: eventNameIn("invite_sent"),
  },
  { id: "error", name: "Hit an error", getFilter: eventNameIn("error") },
  {
    id: "report",
    name: "Created a report",
    getFilter: eventNameIn("report_created"),
  },
];
