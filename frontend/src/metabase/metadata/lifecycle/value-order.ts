import { t } from "ttag";

import { isBoolean } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

import { inferLifecycleField } from "./status-fields";

/** How a column's values relate: the spec's enum_kind */
export type EnumKind = "nominal" | "ordinal" | "cyclic" | "boolean";

export const ENUM_KINDS: EnumKind[] = [
  "nominal",
  "ordinal",
  "cyclic",
  "boolean",
];

export type EnumKindInference = {
  kind: EnumKind;
  signal: string;
  confidence: "high" | "low";
};

/** Where a value sits in its lifecycle; won, lost, and cancelled are terminal */
export type ValueBucket = "open" | "won" | "lost" | "cancelled" | "other";

export const VALUE_BUCKETS: ValueBucket[] = [
  "open",
  "won",
  "lost",
  "cancelled",
  "other",
];

/** A value in lifecycle order: its rank is its position in the list */
export type OrderedValue = { value: string; bucket: ValueBucket };

export type ValueOrderInference = {
  values: OrderedValue[];
  /** No lifecycle words matched, so there's no guess to confirm */
  isGuess: boolean;
  signal: string;
};

export function getEnumKindLabel(kind: EnumKind): string {
  switch (kind) {
    case "nominal":
      return t`Unordered`;
    case "ordinal":
      return t`Ordered`;
    case "cyclic":
      return t`Cyclic`;
    case "boolean":
      return t`Yes or no`;
  }
}

export function getValueBucketLabel(bucket: ValueBucket): string {
  switch (bucket) {
    case "open":
      return t`Open`;
    case "won":
      return t`Won`;
    case "lost":
      return t`Lost`;
    case "cancelled":
      return t`Cancelled`;
    case "other":
      return t`Other`;
  }
}

export function isTerminalBucket(bucket: ValueBucket): boolean {
  return bucket === "won" || bucket === "lost" || bucket === "cancelled";
}

/** Status and Priority are ordinal; flags are yes or no; the rest nominal */
export function inferEnumKind(field: Field): EnumKindInference {
  if (isBoolean(field)) {
    return {
      kind: "boolean",
      signal: t`${field.display_name} holds true and false`,
      confidence: "high",
    };
  }
  const lifecycle = inferLifecycleField(field);
  if (lifecycle) {
    return {
      kind: "ordinal",
      signal: lifecycle.signal,
      confidence: lifecycle.confidence,
    };
  }
  return {
    kind: "nominal",
    signal: t`No order in the name`,
    confidence: "high",
  };
}

// Lifecycle words, checked in this order so "closed_lost" is lost, not won.
// Open words are listed in pipeline order, which ranks the open values.
const CANCELLED_WORDS = [
  "cancelled",
  "canceled",
  "cancel",
  "void",
  "voided",
  "refunded",
  "churned",
  "expired",
  "abandoned",
];
const LOST_WORDS = [
  "closedlost",
  "lost",
  "failed",
  "fail",
  "declined",
  "rejected",
  "reject",
];
const WON_WORDS = [
  "closedwon",
  "won",
  "complete",
  "completed",
  "closed",
  "paid",
  "solved",
  "resolved",
  "done",
  "delivered",
  "shipped",
  "fulfilled",
  "success",
  "successful",
  "approved",
  "accepted",
  "converted",
];
const OPEN_WORDS = [
  "draft",
  "new",
  "created",
  "submitted",
  "open",
  "triage",
  "backlog",
  "todo",
  "to_do",
  "assigned",
  "pending",
  "scheduled",
  "qualified",
  "in_progress",
  "inprogress",
  "working",
  "review",
  "in_review",
  "proposal",
  "negotiation",
  "on_hold",
];

const tokensOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const hasWord = (normalized: string, word: string) =>
  normalized === word || new RegExp(`(^|_)${word}(_|$)`).test(normalized);

function getBucket(value: string): ValueBucket {
  const normalized = tokensOf(value);
  if (CANCELLED_WORDS.some((word) => hasWord(normalized, word))) {
    return "cancelled";
  }
  if (LOST_WORDS.some((word) => hasWord(normalized, word))) {
    return "lost";
  }
  if (WON_WORDS.some((word) => hasWord(normalized, word))) {
    return "won";
  }
  if (OPEN_WORDS.some((word) => hasWord(normalized, word))) {
    return "open";
  }
  return "other";
}

/** Where an open value sits in a typical pipeline; unknown ones go last */
function getOpenRank(value: string): number {
  const normalized = tokensOf(value);
  const index = OPEN_WORDS.findIndex((word) => hasWord(normalized, word));
  return index === -1 ? OPEN_WORDS.length : index;
}

const BUCKET_ORDER: ValueBucket[] = [
  "open",
  "other",
  "won",
  "lost",
  "cancelled",
];

/**
 * Orders values by lifecycle words: open values in pipeline order, then
 * unrecognised ones, then won, lost, and cancelled. A low-confidence guess,
 * below a lookup table or a status history in the spec's order of trust.
 */
export function inferValueOrder(values: string[]): ValueOrderInference {
  const bucketed = values.map((value, index) => ({
    value,
    bucket: getBucket(value),
    openRank: getOpenRank(value),
    index,
  }));
  const ordered = [...bucketed].sort(
    (a, b) =>
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
      (a.bucket === "open" ? a.openRank - b.openRank : 0) ||
      a.index - b.index,
  );
  const recognizedCount = bucketed.filter(
    ({ bucket }) => bucket !== "other",
  ).length;
  return {
    values: ordered.map(({ value, bucket }) => ({ value, bucket })),
    isGuess: recognizedCount > 0,
    signal: t`Ordered by lifecycle words: ${recognizedCount} of ${values.length} values recognized`,
  };
}

/**
 * An admin's order, kept as set. Values sync finds later go last as Other,
 * and values no longer in the column drop out.
 */
export function resolveValueOrder(
  values: string[],
  savedOrder: OrderedValue[],
): OrderedValue[] {
  const known = new Set(savedOrder.map(({ value }) => value));
  return [
    ...savedOrder.filter(
      ({ value }) => values.length === 0 || values.includes(value),
    ),
    ...values
      .filter((value) => !known.has(value))
      .map((value): OrderedValue => ({ value, bucket: "other" })),
  ];
}
