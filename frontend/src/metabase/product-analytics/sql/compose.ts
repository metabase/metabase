/**
 * Stage three: the only place that builds a large string.
 *
 * Planners hand back named blocks and a final SELECT. This orders the blocks so
 * every one appears after what it reads, drops duplicates by name so two
 * planners asking for `scoped_events` get one, and renders the statement.
 */

export interface Cte {
  name: string;
  /** The SELECT that goes inside the parentheses. */
  body: string;
  /** Other CTE names this block reads. */
  deps: string[];
  /** Rendered as a comment above the block. */
  note?: string;
}

export interface QueryPlan {
  ctes: Cte[];
  select: string;
  warnings: string[];
}

export class CycleError extends Error {}

/**
 * Depth-first topological sort. A cycle throws rather than emitting SQL that
 * would fail at the server with a much worse message.
 */
const order = (ctes: Cte[]): Cte[] => {
  const byName = new Map(ctes.map((cte) => [cte.name, cte]));
  const sorted: Cte[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (name: string, trail: string[]) => {
    if (done.has(name)) {
      return;
    }
    if (onStack.has(name)) {
      throw new CycleError(
        `Query blocks form a cycle: ${[...trail, name].join(" → ")}`,
      );
    }
    const cte = byName.get(name);
    if (!cte) {
      return;
    }
    onStack.add(name);
    for (const dep of cte.deps) {
      visit(dep, [...trail, name]);
    }
    onStack.delete(name);
    done.add(name);
    sorted.push(cte);
  };

  for (const cte of ctes) {
    visit(cte.name, []);
  }
  return sorted;
};

/** Last definition wins, which lets a planner override a shared block. */
const dedupe = (ctes: Cte[]): Cte[] => {
  const byName = new Map<string, Cte>();
  for (const cte of ctes) {
    byName.set(cte.name, cte);
  }
  return [...byName.values()];
};

const indent = (sql: string) =>
  sql
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join("\n");

export const compose = (plan: QueryPlan): string => {
  const ctes = order(dedupe(plan.ctes));

  if (ctes.length === 0) {
    return `${plan.select.trim()}\n`;
  }

  const blocks = ctes.map((cte, index) => {
    const note = cte.note ? `-- ${cte.note}\n` : "";
    const keyword = index === 0 ? "WITH " : "";
    const comma = index === ctes.length - 1 ? "" : ",";
    return `${note}${keyword}${cte.name} AS (\n${indent(cte.body.trim())}\n)${comma}`;
  });

  return `${blocks.join("\n")}\n${plan.select.trim()}\n`;
};
