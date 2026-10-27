/**
 * MBQL 5 queries with named stages: a stage reads the stage before it, or the
 * earlier stage its `source-stage` names, and a join can read an earlier stage
 * by name. The query processor compiles each stage to a CTE.
 */
import {
  type BaseType,
  type Clause,
  type Literal,
  expressionRef,
  field,
  typeOf,
} from "./clause";

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
  /** Literal rows, as the stage's source in place of a table or stage. */
  values?: {
    columns: { name: string; "base-type": BaseType }[];
    rows: Literal[][];
  };
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

/** A column a stage returns. */
export type StageColumn = { name: string; baseType: BaseType };

const optionString = (clause: Clause, key: string): string | undefined => {
  const option = clause[1][key];
  return typeof option === "string" ? option : undefined;
};

/** The column a `:field` or `:expression` reference reads, under the name the stage returns it as. */
const refColumn = (ref: Clause): StageColumn => {
  const [tag, , name] = ref;
  const baseType = typeOf(ref);
  if (typeof name !== "string" || baseType === undefined) {
    throw new Error(`Not a typed column reference: ${JSON.stringify(ref)}`);
  }
  const joinAlias = optionString(ref, "join-alias");
  return {
    name:
      tag === "field" && joinAlias !== undefined
        ? `${joinAlias}__${name}`
        : name,
    baseType,
  };
};

/** The column a named expression or aggregation makes. */
const namedColumn = (clause: Clause, nameKey: string): StageColumn => {
  const name = optionString(clause, nameKey);
  const baseType = typeOf(clause);
  if (name === undefined || baseType === undefined) {
    throw new Error(
      `State the type of ${name ?? "this clause"}: ${JSON.stringify(clause)}`,
    );
  }
  return { name, baseType };
};

/**
 * The stages a query is built from, in the order added: a stage can only read
 * the ones before it. Adding a stage under a name already used replaces that
 * stage in its place.
 *
 * Every stage leaves with its `:fields` stated, so the query processor never
 * works them out at run time: a stage without them gets its source's columns,
 * its joins' fields and its expressions. A stage reading a table must state
 * its own, as the query builder does.
 */
export class StageList {
  private readonly stages = new Map<string, Stage>();
  private readonly columns = new Map<string, StageColumn[]>();
  private last: string | undefined;

  add(...stages: Stage[]): this {
    for (const added of stages) {
      if (added.name === undefined) {
        throw new Error("Stages added by planners need a name");
      }
      const [explicit, columns] = this.withFields(added);
      this.stages.set(added.name, explicit);
      this.columns.set(added.name, columns);
      this.last = added.name;
    }
    return this;
  }

  has(name: string): boolean {
    return this.stages.has(name);
  }

  /** The columns of the stage called `name`. */
  columnsOf(name: string): StageColumn[] {
    const columns = this.columns.get(name);
    if (columns === undefined) {
      throw new Error(`No stage called ${name}`);
    }
    return columns;
  }

  private sourceColumns(stage: MbqlStage): StageColumn[] {
    const source = stage["source-stage"] ?? this.last;
    if (source === undefined) {
      throw new Error(`${stage.name} reads no earlier stage`);
    }
    return this.columnsOf(source);
  }

  private joinColumns(join: Join): { column: StageColumn; ref: Clause }[] {
    const fields =
      join.fields === "all"
        ? this.columnsOf(join["source-stage"] ?? "").map((column) =>
            field(column.name, column.baseType, join.alias),
          )
        : join.fields === "none"
          ? []
          : join.fields;
    return fields.map((ref) => ({ column: refColumn(ref), ref }));
  }

  private withFields(stage: Stage): [Stage, StageColumn[]] {
    if (stage["lib/type"] === "mbql.stage/native") {
      throw new Error("Native stages have no columns the planners can read");
    }
    if (stage.values !== undefined) {
      return [
        stage,
        stage.values.columns.map((column) => ({
          name: column.name,
          baseType: column["base-type"],
        })),
      ];
    }
    if (stage.aggregation !== undefined || stage.breakout !== undefined) {
      return [
        stage,
        [
          ...(stage.breakout ?? []).map(refColumn),
          ...(stage.aggregation ?? []).map((agg) => namedColumn(agg, "name")),
        ],
      ];
    }
    if (stage.fields !== undefined) {
      return [stage, stage.fields.map(refColumn)];
    }
    if (stage["source-table"] !== undefined) {
      throw new Error(
        `${stage.name} reads a table, so it has to state its fields`,
      );
    }
    const expressions = (stage.expressions ?? []).map((expr) => ({
      column: namedColumn(expr, "lib/expression-name"),
      ref: expressionRef(
        namedColumn(expr, "lib/expression-name").name,
        namedColumn(expr, "lib/expression-name").baseType,
      ),
    }));
    // An expression with the name of a source column takes its place.
    const shadowed = new Set(expressions.map(({ column }) => column.name));
    const selected = [
      ...this.sourceColumns(stage)
        .filter(({ name }) => !shadowed.has(name))
        .map((column) => ({
          column,
          ref: field(column.name, column.baseType),
        })),
      ...(stage.joins ?? []).flatMap((join) => this.joinColumns(join)),
      ...expressions,
    ];
    return [
      { ...stage, fields: selected.map(({ ref }) => ref) },
      selected.map(({ column }) => column),
    ];
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
