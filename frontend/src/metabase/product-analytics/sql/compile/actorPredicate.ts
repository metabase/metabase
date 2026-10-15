import type { ActorPredicate, CountOp, Duration } from "../../spec/types";

import { num } from "./dialect";
import { flagSql } from "./flag";

const COUNT_CMP: Record<CountOp, string> = {
  "at least": ">=",
  "at most": "<=",
  exactly: "=",
};

export const seconds = (duration: Duration): number => {
  const per: Record<Duration["unit"], number> = {
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
  };
  return duration.value * per[duration.unit];
};

export interface PredicateSql {
  having: string[];
  warnings: string[];
}

const one = (predicate: ActorPredicate): PredicateSql => {
  switch (predicate.kind) {
    case "did":
      return {
        having: [
          `countIf(${flagSql(predicate.flag)}) ${COUNT_CMP[predicate.cmp]} ${num(predicate.count)}`,
        ],
        warnings: [],
      };
    case "didnt":
      return {
        having: [`countIf(${flagSql(predicate.flag)}) = 0`],
        warnings: [],
      };
    case "group":
      return compileActorPredicate(predicate);
  }
};

export const compileActorPredicate = (
  predicate: ActorPredicate,
): PredicateSql => {
  if (predicate.kind !== "group") {
    return one(predicate);
  }

  const parts = predicate.items.map(one);
  const out: PredicateSql = {
    having: [],
    warnings: parts.flatMap((p) => p.warnings),
  };

  if (parts.length === 0) {
    return out;
  }

  if (predicate.joiner === "and") {
    out.having = parts.flatMap((p) => p.having);
  } else {
    const branches = parts.map((part) =>
      part.having.length ? `(${part.having.join(" AND ")})` : "1",
    );
    out.having = [`(${branches.join(" OR ")})`];
  }

  if (predicate.negated) {
    return {
      having: out.having.length ? [`NOT (${out.having.join(" AND ")})`] : [],
      warnings: out.warnings,
    };
  }

  return out;
};

export const isEmptyScope = (predicate: ActorPredicate): boolean =>
  predicate.kind === "group" && predicate.items.length === 0;
