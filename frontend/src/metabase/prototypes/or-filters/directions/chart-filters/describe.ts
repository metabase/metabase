import { createContext } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";

/** Whether an LLM (Metabot) is plugged in. Off shows the mechanical fallbacks. */
export const LlmContext = createContext(true);

const MAX_INLINE_DEPTH = 2;
const MAX_SOURCE_NAME_LENGTH = 60;

/**
 * A filter read structurally, no LLM: AND reads "all of", OR "any of", NOT
 * "not". Groups nested deeper than two levels fold into "any of 3 conditions".
 */
function describeClause(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
  depth: number,
): string {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  const children = () =>
    parts.args.map((arg) =>
      toFilterClause(query, stageIndex, Lib.expressionClause(arg)),
    );

  if (parts.operator === "not" && parts.args.length === 1) {
    const [child] = children();
    return t`not ${describeClause(query, stageIndex, child, depth + 1)}`;
  }
  if (parts.operator === "and" || parts.operator === "or") {
    const count = parts.args.length;
    if (depth >= MAX_INLINE_DEPTH) {
      return parts.operator === "or"
        ? t`any of ${count} conditions`
        : t`all of ${count} conditions`;
    }
    const inner = children()
      .map((child) => describeClause(query, stageIndex, child, depth + 1))
      .join(", ");
    return parts.operator === "or"
      ? t`any of (${inner})`
      : t`all of (${inner})`;
  }
  return Lib.displayInfo(query, stageIndex, clause).displayName;
}

/** Every filter on the stage, top-level ANDs separated by " · ". */
export function describeFilters(query: Lib.Query, stageIndex: number): string {
  return Lib.filters(query, stageIndex)
    .map((filter) => describeClause(query, stageIndex, filter, 0))
    .join(" · ");
}

/** "Orders where …" when short, otherwise the first condition and a count. */
export function mechanicalSourceName(
  query: Lib.Query,
  stageIndex: number,
  tableName: string,
): string {
  const filters = Lib.filters(query, stageIndex);
  if (filters.length === 0) {
    return tableName;
  }
  const description = describeFilters(query, stageIndex);
  if (description.length <= MAX_SOURCE_NAME_LENGTH) {
    return t`${tableName} where ${description}`;
  }
  const first = describeClause(query, stageIndex, filters[0], 1);
  const more = filters.length - 1;
  return more > 0
    ? t`${tableName} where ${first} + ${more} more`
    : t`${tableName}, ${filters.length} conditions`;
}

type CannedName = { keywords: string[]; name: string };

/** Stands in for Metabot naming the source; keyed on words in the filters. */
const CANNED_SOURCE_NAMES: CannedName[] = [
  {
    keywords: ["doohickey", "affiliate"],
    get name() {
      return t`Q4 2025 promo orders, no Doohickeys`;
    },
  },
  {
    keywords: ["not any of", "affiliate"],
    get name() {
      return t`Full-margin orders`;
    },
  },
  {
    keywords: ["google", "discount"],
    get name() {
      return t`2026 orders with a coupon or from Google customers`;
    },
  },
  {
    keywords: ["affiliate", "discount"],
    get name() {
      return t`Discounted or affiliate orders`;
    },
  },
  {
    keywords: ["facebook", "google"],
    get name() {
      return t`Orders from CA and TX ad-test customers`;
    },
  },
  {
    keywords: ["quantity", "total"],
    get name() {
      return t`Big orders to check before shipping`;
    },
  },
  {
    keywords: ["created at"],
    get name() {
      return t`Orders from 2026`;
    },
  },
];

/** What Metabot would call the source, or `undefined` when it has no canned answer. */
export function llmSourceName(
  query: Lib.Query,
  stageIndex: number,
): string | undefined {
  const description = describeFilters(query, stageIndex).toLowerCase();
  if (description === "") {
    return undefined;
  }
  return CANNED_SOURCE_NAMES.find(({ keywords }) =>
    keywords.every((keyword) => description.includes(keyword)),
  )?.name;
}

/** The source's name: Metabot's when plugged in and it has one, the mechanical one otherwise. */
export function getSourceName(
  query: Lib.Query,
  stageIndex: number,
  tableName: string,
  hasLlm: boolean,
): string {
  return (
    (hasLlm ? llmSourceName(query, stageIndex) : undefined) ??
    mechanicalSourceName(query, stageIndex, tableName)
  );
}
