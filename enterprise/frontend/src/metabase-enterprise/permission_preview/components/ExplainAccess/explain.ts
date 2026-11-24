import { msgid, ngettext, t } from "ttag";

import type {
  PermissionDebugAnswer,
  PermissionDebugCollection,
  PermissionDebugGroupValue,
  PermissionDebugReasons,
  PermissionDebugRoute,
  PermissionDebugTable,
} from "metabase-types/api";

import { formatList } from "../../utils/format-list";
import type { PreviewTarget } from "../types";

import type { ValueStatus } from "./labels";

export type ExplainedItemType = "question" | "dashboard" | "collection";

export type TableStatus = "blocked" | "cant-load" | "filtered" | "can-view";

export type VerdictKind = "success" | "filtered" | "warning" | "error";

export interface Verdict {
  kind: VerdictKind;
  text: string;
  /** The reason under an error: why the person can't open the item */
  reason?: string;
}

export interface ExplainAnswers {
  read: PermissionDebugAnswer;
  /** The run check of a question or dashboard; none for a collection */
  query?: PermissionDebugAnswer;
  /** The download verdict of a question */
  download?: PermissionDebugAnswer;
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
  reasons: PermissionDebugReasons,
): TableStatus {
  const { problems = [], impersonations = [] } = reasons;
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

/** The label of a table's status: "Full access" in an item's card, "Can view" in lists of every table. */
export function getTableStatusLabel(
  status: TableStatus,
  context: "card" | "list" = "card",
) {
  switch (status) {
    case "blocked":
      return t`Blocked`;
    case "cant-load":
      return t`Can't load`;
    case "filtered":
      return t`Rows filtered`;
    case "can-view":
      return context === "card" ? t`Full access` : t`Can view`;
  }
}

export function getTableStatusDisplay(
  status: TableStatus,
  context: "card" | "list" = "card",
): ValueStatus {
  const label = getTableStatusLabel(status, context);
  switch (status) {
    case "blocked":
      return { label, icon: "close", color: "feedback-negative" };
    case "cant-load":
      return { label, icon: "warning", color: "feedback-warning" };
    case "filtered":
      return { label, icon: "permissions_limited", color: "core-brand" };
    case "can-view":
      return { label, icon: "eye", color: "feedback-positive" };
  }
}

export function getVerdict(
  itemType: ExplainedItemType,
  subject: string,
  { read, query }: ExplainAnswers,
): Verdict {
  const who = capitalize(subject);
  const item = getItemNoun(itemType);

  if (read.decision === "denied") {
    const collection = read.reasons.collection;
    return {
      kind: "error",
      text: t`${who} can't open this ${item}.`,
      reason: collection
        ? t`${who} has no access to its collection, ${collection.name}.`
        : undefined,
    };
  }
  if (!query) {
    return { kind: "success", text: t`${who} can open this ${item}.` };
  }
  if (query.outcome === "broken") {
    return { kind: "warning", text: t`Queries fail for ${subject}.` };
  }
  if (query.decision === "denied" && itemType === "dashboard") {
    return {
      kind: "warning",
      text: t`${who} can open this dashboard but can't see any of its cards.`,
    };
  }
  if (query.decision === "denied") {
    return {
      kind: "warning",
      text: t`${who} can open this ${item} but can't see its results.`,
    };
  }
  if (query.decision === "limited") {
    const blocked = query.data["cards-blocked"] ?? 0;
    const total = query.data["cards-total"] ?? 0;
    return {
      kind: "warning",
      text: ngettext(
        msgid`${who} can open this dashboard but can't see ${blocked} of its ${total} card.`,
        `${who} can open this dashboard but can't see ${blocked} of its ${total} cards.`,
        total,
      ),
    };
  }
  return {
    kind: query.outcome === "reshaped" ? "filtered" : "success",
    text: t`${who} can see this ${item}.`,
  };
}

export function getCollectionVerdict(
  subject: string,
  collection: PermissionDebugCollection,
) {
  const who = capitalize(subject);
  switch (collection.value) {
    case "curate":
      return t`${who} can curate this collection.`;
    case "view":
      return t`${who} can view this collection.`;
    default:
      return t`${who} can't open this collection.`;
  }
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

/** A collection's name as the sheet shows it: a personal collection is the person's, in a sentence's words. */
export function getCollectionName(
  collection: Pick<PermissionDebugCollection, "name" | "personal?">,
  target: PreviewTarget,
) {
  if (!collection["personal?"]) {
    return collection.name;
  }
  return target.kind === "user"
    ? t`${target.user.common_name}'s personal collection`
    : t`Their personal collection`;
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
      return t`${route["db-name"]}: every query fails: no value for ${route.attribute}.`;
    case "no-destination":
      return t`${route["db-name"]}: every query fails, no database is named ${route.value}.`;
  }
}

/** Tables with the same value fold into one row; the order is the first table's. */
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

/** The tables a person has the most trouble with first: blocked or failing, then filtered, then the rest. */
export function sortTablesByStatus(
  tables: PermissionDebugTable[],
  reasons: PermissionDebugReasons,
) {
  const order: Record<TableStatus, number> = {
    blocked: 0,
    "cant-load": 0,
    filtered: 1,
    "can-view": 2,
  };
  return tables
    .map((table) => ({ table, status: getTableStatus(table, reasons) }))
    .sort((first, second) => order[first.status] - order[second.status]);
}

/**
 * What keeps a table from loading, in the paragraphs the reason view and the
 * rule lists show: each with its fix. Empty when nothing is wrong with it.
 */
export function getTableProblemNotes(
  table: PermissionDebugTable,
  reasons: PermissionDebugReasons,
  target: PreviewTarget,
) {
  const subject = getSubject(target);
  const enforced = table.sandboxes.filter((sandbox) => sandbox["enforced?"]);
  const notes: string[] = [];

  if (enforced.length > 1) {
    const groups = formatList(enforced.map((sandbox) => sandbox["group-name"]));
    const sentence =
      enforced.length === 2
        ? t`${groups} both set row and column security on ${table.name}.`
        : t`${groups} all set row and column security on ${table.name}.`;
    notes.push(
      `${sentence} ${t`Keep one policy, or give one of the groups Can view on ${table.name}.`}`,
    );
  }

  const impersonators = (reasons.impersonations ?? []).filter(
    (impersonation) =>
      impersonation["db-id"] === table["db-id"] && impersonation["enforced?"],
  );
  if (enforced.length > 0 && impersonators.length > 0) {
    const sandboxGroups = formatList(
      enforced.map((sandbox) => sandbox["group-name"]),
    );
    const impersonationGroups = formatList(
      impersonators.map((impersonation) => impersonation["group-name"]),
    );
    notes.push(
      `${t`Row and column security from ${sandboxGroups} and connection impersonation from ${impersonationGroups} both apply on ${table["db-name"]}.`} ${t`Keep one of the two policies.`}`,
    );
  }

  const missing = getMissingAttributes(enforced);
  if (missing.length > 0) {
    const attributeCount = missing.reduce(
      (count, entry) => count + entry.attributes.length,
      0,
    );
    const sentences = missing.map(({ group, attributes }) =>
      getMissingAttributeSentence(target, subject, group, attributes),
    );
    notes.push(
      `${sentences.join(" ")} ${getMissingAttributeFix(target, subject, attributeCount)}`,
    );
  }

  return notes;
}

function getMissingAttributes(
  sandboxes: PermissionDebugTable["sandboxes"],
): { group: string; attributes: string[] }[] {
  return sandboxes.flatMap((sandbox) => {
    const attributes = sandbox.filters
      .filter((filter) => filter["missing?"])
      .map((filter) => filter.attribute);
    return attributes.length > 0
      ? [{ group: sandbox["group-name"], attributes }]
      : [];
  });
}

function getMissingAttributeSentence(
  target: PreviewTarget,
  subject: string,
  group: string,
  attributes: string[],
) {
  const list = formatList(attributes);
  if (target.kind === "group") {
    const previewed = target.group.name;
    return ngettext(
      msgid`Members of ${previewed} need the attribute ${list} (rule set by ${group}).`,
      `Members of ${previewed} need the attributes ${list} (rule set by ${group}).`,
      attributes.length,
    );
  }
  return ngettext(
    msgid`${group} needs the attribute ${list}, which ${subject} doesn't have.`,
    `${group} needs the attributes ${list}, which ${subject} doesn't have.`,
    attributes.length,
  );
}

function getMissingAttributeFix(
  target: PreviewTarget,
  subject: string,
  attributeCount: number,
) {
  if (target.kind === "group") {
    return ngettext(
      msgid`Pick a value for it in the preview to see their view.`,
      `Pick values for them in the preview to see their view.`,
      attributeCount,
    );
  }
  return ngettext(
    msgid`Set it on ${subject} in Admin › People, or in their sign-in provider.`,
    `Set them on ${subject} in Admin › People, or in their sign-in provider.`,
    attributeCount,
  );
}

export function countCollectionValues(
  collections: PermissionDebugCollection[],
) {
  return {
    curate: collections.filter(({ value }) => value === "curate").length,
    view: collections.filter(({ value }) => value === "view").length,
    none: collections.filter(({ value }) => value === "none").length,
  };
}

export function countTableStatuses(
  tables: PermissionDebugTable[],
  reasons: PermissionDebugReasons,
) {
  const counts: Record<TableStatus, number> = {
    blocked: 0,
    "cant-load": 0,
    filtered: 0,
    "can-view": 0,
  };
  tables.forEach((table) => {
    counts[getTableStatus(table, reasons)] += 1;
  });
  return counts;
}
