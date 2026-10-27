/**
 * MBQL 5 queries with named stages: a stage reads the stage before it, or the
 * earlier stage its `source-stage` names, and a join can read an earlier stage
 * by name. The query processor compiles each stage to a CTE.
 */
import type { Clause } from "./clause";

export type JoinStrategy = "left-join" | "inner-join" | "full-join";

export interface Join {
  "lib/type": "mbql/join";
  alias: string;
  strategy: JoinStrategy;
  conditions: Clause[];
  fields: "all" | "none" | Clause[];
  /** The earlier stage the join reads. */
  "source-stage"?: string;
  /** Stages of the join's own, when it doesn't read a named stage. */
  stages?: Stage[];
}

export interface MbqlStage {
  "lib/type": "mbql.stage/mbql";
  name?: string;
  "source-stage"?: string;
  /** Earlier stages whose rows are appended to the source stage's. */
  "union-all"?: string[];
  "source-table"?: number;
  joins?: Join[];
  expressions?: Clause[];
  filters?: Clause[];
  breakout?: Clause[];
  aggregation?: Clause[];
  fields?: Clause[];
  "order-by"?: Clause[];
  limit?: number;
}

export interface NativeStage {
  "lib/type": "mbql.stage/native";
  name?: string;
  native: string;
}

export type Stage = MbqlStage | NativeStage;

export interface Query {
  "lib/type": "mbql/query";
  database: number;
  stages: Stage[];
}

type StageInput = Omit<MbqlStage, "lib/type" | "name" | "source-stage">;

/**
 * A stage called `name` that reads `source`, or the stage before it. Empty
 * clause lists are left out, as MBQL requires.
 */
export const stage = (
  name: string,
  source: string | undefined,
  body: StageInput,
): MbqlStage => {
  const nonEmpty: StageInput = { ...body };
  for (const key of CLAUSE_LISTS) {
    if (nonEmpty[key]?.length === 0) {
      delete nonEmpty[key];
    }
  }
  return {
    "lib/type": "mbql.stage/mbql",
    name,
    ...(source !== undefined ? { "source-stage": source } : {}),
    ...nonEmpty,
  };
};

const CLAUSE_LISTS = [
  "joins",
  "expressions",
  "filters",
  "breakout",
  "aggregation",
  "fields",
  "order-by",
  "union-all",
] as const satisfies readonly (keyof StageInput)[];

/** Joins the earlier stage `source` as `alias`. */
export const joinStage = (
  source: string,
  alias: string,
  conditions: Clause[],
  {
    strategy = "left-join",
    fields = "none",
  }: { strategy?: JoinStrategy; fields?: Join["fields"] } = {},
): Join => ({
  "lib/type": "mbql/join",
  alias,
  strategy,
  conditions,
  fields,
  "source-stage": source,
});

/**
 * The stages a query is built from, in the order added: a stage can only read
 * the ones before it. Adding a stage under a name already used replaces that
 * stage in its place.
 */
export class StageList {
  private readonly stages = new Map<string, Stage>();

  add(...stages: Stage[]): this {
    for (const added of stages) {
      if (added.name === undefined) {
        throw new Error("Stages added by planners need a name");
      }
      this.stages.set(added.name, added);
    }
    return this;
  }

  has(name: string): boolean {
    return this.stages.has(name);
  }

  toQuery(database: number): Query {
    return {
      "lib/type": "mbql/query",
      database,
      stages: [...this.stages.values()],
    };
  }
}

/** Thrown for analyses, or settings of one, that have no MBQL planner yet. */
export class NotPortedError extends Error {}
