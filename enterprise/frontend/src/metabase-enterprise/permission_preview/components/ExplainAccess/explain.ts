import { t } from "ttag";

import type {
  PermissionDebugAnswer,
  PermissionDebugGroupValue,
  PermissionDebugProblem,
  PermissionDebugRoute,
  PermissionDebugTable,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

export type ExplainedItemType = "question" | "dashboard" | "collection";

export type TableStatus = "blocked" | "cant-load" | "filtered" | "can-view";

export type VerdictTone = "success" | "warning" | "error";

export interface Verdict {
  tone: VerdictTone;
  text: string;
}

export interface ExplainAnswers {
  read: PermissionDebugAnswer;
  /** The run check of a question or dashboard; none for a collection */
  query?: PermissionDebugAnswer;
  /** The download verdict of a question */
  download?: PermissionDebugAnswer;
}

/** A table's own name, with its schema when it has one */
export function getTableName(table: PermissionDebugTable) {
  return table.name;
}

export function getSubject(target: PreviewTarget) {
  return target.kind === "user"
    ? target.user.common_name
    : t`a member of ${target.group.name}`;
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getTableStatus(
  table: PermissionDebugTable,
  query: PermissionDebugAnswer,
): TableStatus {
  const { problems = [], impersonations = [] } = query.reasons;
  const hasProblem = problems.some(
    (problem) =>
      ("table-id" in problem && problem["table-id"] === table["table-id"]) ||
      ("db-id" in problem && problem["db-id"] === table["db-id"]),
  );

  if (table["view-data"].value === "blocked") {
    return "blocked";
  }
  if (hasProblem) {
    return "cant-load";
  }

  const isSandboxed = table.sandboxes.some((sandbox) => sandbox["enforced?"]);
  const isImpersonated = impersonations.some(
    (impersonation) =>
      impersonation["db-id"] === table["db-id"] && impersonation["enforced?"],
  );
  return isSandboxed || isImpersonated ? "filtered" : "can-view";
}

export function getVerdict(
  itemType: ExplainedItemType,
  subject: string,
  { read, query }: ExplainAnswers,
): Verdict {
  const who = capitalize(subject);
  const item = getItemNoun(itemType);

  if (read.decision === "denied") {
    return { tone: "error", text: t`${who} can't open this ${item}.` };
  }
  if (!query) {
    return { tone: "success", text: t`${who} can open this ${item}.` };
  }
  if (query.outcome === "broken") {
    return { tone: "error", text: t`Queries fail for ${subject}.` };
  }
  if (query.decision === "denied" && itemType === "dashboard") {
    return {
      tone: "warning",
      text: t`${who} can open this dashboard but can't see any of its cards.`,
    };
  }
  if (query.decision === "denied") {
    return {
      tone: "warning",
      text: t`${who} can open this question but can't see its results.`,
    };
  }
  if (query.decision === "limited") {
    const blocked = query.data["cards-blocked"] ?? 0;
    const total = query.data["cards-total"] ?? 0;
    return {
      tone: "warning",
      text: t`${who} can open this dashboard but can't see ${blocked} of its ${total} cards.`,
    };
  }
  return { tone: "success", text: t`${who} can see this ${item}.` };
}

export function getItemNoun(itemType: ExplainedItemType) {
  switch (itemType) {
    case "question":
      return t`question`;
    case "dashboard":
      return t`dashboard`;
    case "collection":
      return t`collection`;
  }
}

export function getGroupLabel(group: PermissionDebugGroupValue) {
  return group["group-name"];
}

/** The groups whose value is the person's, the ones to name as the source */
export function getApplyingGroups(groups: PermissionDebugGroupValue[]) {
  return groups.filter((group) => group["applies?"]);
}

export function getSourceText(groups: PermissionDebugGroupValue[]) {
  const names = getApplyingGroups(groups).map(getGroupLabel);
  return names.length > 0 ? t`from ${names.join(", ")}` : null;
}

export function getRouteSentence(route: PermissionDebugRoute) {
  switch (route.status) {
    case "routed":
      return t`${route["db-name"]}: queries go to ${route["destination-name"]}, picked by ${route.attribute} = ${route.value}.`;
    case "router":
      return t`${route["db-name"]}: queries stay on this database (${route.attribute} = ${route.value}).`;
    case "missing-value":
      return t`${route["db-name"]}: every query fails, there is no value for ${route.attribute}.`;
    case "no-destination":
      return t`${route["db-name"]}: every query fails, no database is named ${route.value}.`;
  }
}

/** Tables with the same create-queries value and source fold into one row */
export function groupTablesByValue(
  tables: PermissionDebugTable[],
  getValue: (table: PermissionDebugTable) => string,
) {
  const groups = new Map<string, PermissionDebugTable[]>();
  tables.forEach((table) => {
    const value = getValue(table);
    groups.set(value, [...(groups.get(value) ?? []), table]);
  });
  return Array.from(groups, ([value, groupTables]) => ({
    value,
    tables: groupTables,
  }));
}

/** The sentence for a conflict between policies; the other problems have their own rows */
export function getConflictSentence(
  problem: PermissionDebugProblem,
  query: PermissionDebugAnswer,
) {
  const tables = query.reasons.tables ?? [];

  if (problem.type === "conflicting-sandboxes") {
    const table = tables.find(
      (candidate) => candidate["table-id"] === problem["table-id"],
    );
    const groups = (table?.sandboxes ?? [])
      .filter((sandbox) => sandbox["enforced?"])
      .map((sandbox) => sandbox["group-name"])
      .join(", ");
    return t`${table?.name}: the row and column security of two groups (${groups}) both apply, so queries fail.`;
  }
  if (problem.type === "sandbox-and-impersonation") {
    const database = tables.find(
      (table) => table["db-id"] === problem["db-id"],
    )?.["db-name"];
    return t`${database}: row and column security and connection impersonation both apply, so queries fail.`;
  }
  return null;
}
