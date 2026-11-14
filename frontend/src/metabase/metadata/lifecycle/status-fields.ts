import { t } from "ttag";

import {
  isBoolean,
  isDate,
  isNumeric,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

/**
 * Lifecycle columns, recognised by name. These mirror the type/Status and
 * type/Priority rules of the field semantic types (project 04, stacked PR
 * #86445) so this can switch to reading the field's type once those land.
 */
export type LifecycleFieldKind = "status" | "priority";

export type LifecycleFieldInference = {
  kind: LifecycleFieldKind;
  signal: string;
  confidence: "high" | "low";
};

type LifecycleRule = {
  pattern: RegExp;
  kind: LifecycleFieldKind;
  isTextOnly?: boolean;
  confidence: "high" | "low";
};

const LIFECYCLE_RULES: LifecycleRule[] = [
  {
    pattern: /(^|_)(status|stage|phase|result|outcome)$/,
    kind: "status",
    confidence: "high",
  },
  // "state" is often an address
  {
    pattern: /(^|_)state$/,
    kind: "status",
    isTextOnly: true,
    confidence: "low",
  },
  {
    pattern: /(^|_)(priority|severity|urgency|tier)$/,
    kind: "priority",
    confidence: "high",
  },
  { pattern: /(^|_)level$/, kind: "priority", confidence: "low" },
];

const nameOf = (field: Field) => field.name.toLowerCase();

export function inferLifecycleField(
  field: Field,
): LifecycleFieldInference | null {
  if (
    isBoolean(field) ||
    isDate(field) ||
    field.semantic_type === "type/State"
  ) {
    return null;
  }
  const isText = isString(field);
  if (!isText && !isNumeric(field)) {
    return null;
  }
  const rule = LIFECYCLE_RULES.find(
    ({ pattern, isTextOnly }) =>
      pattern.test(nameOf(field)) && (!isTextOnly || isText),
  );
  if (!rule) {
    return null;
  }
  return {
    kind: rule.kind,
    signal:
      rule.kind === "status"
        ? t`${field.display_name} is named like a status`
        : t`${field.display_name} is named like a priority`,
    confidence: rule.confidence,
  };
}

/** Status columns, the clearest names first */
export function getStatusFields(fields: Field[]): Field[] {
  const statuses = fields.flatMap((field) => {
    const inference = inferLifecycleField(field);
    return inference?.kind === "status" ? [{ field, inference }] : [];
  });
  return [
    ...statuses.filter(({ inference }) => inference.confidence === "high"),
    ...statuses.filter(({ inference }) => inference.confidence === "low"),
  ].map(({ field }) => field);
}

// type/MilestoneTimestamp: a verb with _at, minus load and edit bookkeeping
const MILESTONE_RE =
  /^([a-z]+ed|paid|sent|won|lost|begun|done)_(at|on|date|time)$/;
const BOOKKEEPING_RE =
  /^(created|updated|modified|deleted|inserted|loaded|synced|extracted|ingested|processed|refreshed)_/;

export function isMilestoneField(field: Field): boolean {
  const name = nameOf(field);
  return isDate(field) && MILESTONE_RE.test(name) && !BOOKKEEPING_RE.test(name);
}

export function getMilestoneFields(fields: Field[]): Field[] {
  return fields.filter(isMilestoneField);
}
