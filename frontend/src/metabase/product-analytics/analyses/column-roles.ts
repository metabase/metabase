import { TYPE } from "metabase-lib/v1/types/constants";
import { isDate, isString, isa } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import type { ColumnRole } from "../columns";

type RoleRule = {
  semanticType?: string;
  /** Lowercase column names, most likely first. */
  names: string[];
  accepts?: (field: Field) => boolean;
  /** Use the first accepted column when nothing else matches. */
  fallBackToAnyAccepted?: boolean;
};

const ROLE_RULES: Record<ColumnRole, RoleRule> = {
  timestamp: {
    semanticType: TYPE.CreationTimestamp,
    names: ["created_at", "timestamp", "event_time", "time", "ts"],
    accepts: isDate,
    fallBackToAnyAccepted: true,
  },
  person: {
    semanticType: TYPE.User,
    names: ["person_id", "user_id", "distinct_id", "visitor_id"],
  },
  session: {
    names: ["session_id"],
  },
  event_id: {
    names: ["event_id", "id"],
  },
  event_name: {
    names: ["event_name", "event", "action"],
    accepts: isString,
  },
  url_path: {
    semanticType: TYPE.URL,
    names: ["url_path", "path", "page_path", "pathname"],
    accepts: isString,
  },
};

/** Picks a column for a role: by semantic type, then by name, then by type. */
export const getDefaultColumn = (
  table: Table | undefined,
  role: ColumnRole,
): string | null => {
  const { semanticType, names, accepts, fallBackToAnyAccepted } =
    ROLE_RULES[role];
  const fields = (table?.fields ?? []).filter(
    (field) => accepts?.(field) ?? true,
  );

  const bySemanticType =
    semanticType !== undefined
      ? fields.find((field) => isa(field.semantic_type, semanticType))
      : undefined;
  const byName = names
    .map((name) => fields.find((field) => field.name.toLowerCase() === name))
    .find((field) => field !== undefined);
  const byType = fallBackToAnyAccepted ? fields[0] : undefined;

  return (bySemanticType ?? byName ?? byType)?.name ?? null;
};

/** Until the table loads, any stored column is assumed to exist. */
export const isColumnInTable = (
  table: Table | undefined,
  name: unknown,
): boolean =>
  name === null ||
  (typeof name === "string" &&
    (table?.fields === undefined ||
      table.fields.some((field) => field.name === name)));

export const getColumnOptions = (table: Table | undefined) =>
  (table?.fields ?? []).map((field) => ({
    value: field.name,
    label: field.display_name,
  }));
