import type { AnalysisSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { bucket, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import { grainLabel } from "../compile/grain";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents, splitCols, splitGroup } from "./base";

const MODE: Record<string, string> = {
  strict: ", 'strict_order'",
  loose: "",
  any: "",
};

export const planFunnel = (spec: AnalysisSpec): QueryPlan => {
  const funnel = spec.funnel;
  if (!funnel || funnel.steps.length === 0) {
    return {
      ctes: [],
      select: "SELECT 'Add at least one step' AS message",
      warnings: ["The funnel has no steps yet."],
    };
  }

  const warnings: string[] = [];
  const window = seconds(funnel.window);
  const n = funnel.steps.length;

  const stepFlags = funnel.steps.map((step, index) => ({
    as: `step_${index + 1}`,
    sql: flagSql(step.flag),
  }));
  const exclusionFlags = funnel.exclusions.map((exclusion, index) => ({
    as: `excl_${index + 1}`,
    sql: flagSql(exclusion.flag),
  }));

  const base = scopedEvents(spec, undefined, [...stepFlags, ...exclusionFlags]);
  warnings.push(...base.warnings);

  const stamps = funnel.steps
    .map((_, index) => `  minIf(ts, step_${index + 1}) AS t_${index + 1}`)
    .join(",\n");

  let levelExpr: string;
  if (funnel.ordering === "any") {
    levelExpr = funnel.steps
      .map((_, index) => `  countIf(step_${index + 1}) > 0 AS hit_${index + 1}`)
      .join(",\n");
  } else if (funnel.anchor === "each" && n > 1) {
    const pairs = funnel.steps
      .slice(0, -1)
      .map(
        (_, index) =>
          `  windowFunnel(${window})(ts, step_${index + 1}, step_${index + 2}) AS pair_${index + 1}`,
      );
    const ladder = funnel.steps
      .map((_, index) => {
        if (index === 0) {
          return null;
        }
        const conds = Array.from(
          { length: index },
          (_, k) => `pair_${k + 1} >= 2`,
        ).join(" AND ");
        return `    ${conds}, ${index + 1}`;
      })
      .filter((branch): branch is string => branch !== null)
      .reverse();
    const chooser = [
      "  multiIf(",
      ...ladder.map((branch) => `${branch},`),
      "    countIf(step_1) > 0, 1,",
      "    0",
      "  ) AS level",
    ].join("\n");
    levelExpr = [pairs.join(",\n"), chooser].join(",\n");
    warnings.push(
      "“Counted fresh from each step” evaluates each hop's window on its own, so an actor who completes a later hop before an earlier one is still counted. windowFunnel cannot re-anchor inside a single call.",
    );
  } else {
    levelExpr =
      `  windowFunnel(${window}${MODE[funnel.ordering] ?? ""})(\n` +
      "    ts,\n" +
      funnel.steps.map((_, index) => `    step_${index + 1}`).join(",\n") +
      "\n  ) AS level";
  }

  const levels: Cte = {
    name: "funnel_levels",
    note:
      funnel.ordering === "any"
        ? "one row per actor, with a flag per step — order is not enforced"
        : `one row per actor: how far they got within ${funnel.window.value} ${funnel.window.unit}s`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      ...splitCols(base),
      levelExpr + ",",
      stamps,
      "FROM scoped_events",
      `GROUP BY ${splitGroup(base)}actor`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const ctes: Cte[] = [...base.ctes, levels];

  let source = "funnel_levels";
  if (funnel.exclusions.length > 0) {
    const clauses = funnel.exclusions.map((exclusion, index) => {
      const from = Math.min(exclusion.fromStep, n - 1) + 1;
      const to = Math.min(exclusion.toStep, n - 1) + 1;
      return [
        "    SELECT x.actor",
        "    FROM scoped_events AS x",
        "    INNER JOIN funnel_levels AS b ON b.actor = x.actor",
        `    WHERE x.excl_${index + 1}`,
        `      AND x.ts > b.t_${from}`,
        `      AND x.ts < b.t_${to}`,
      ].join("\n");
    });
    ctes.push({
      name: "funnel_kept",
      note: "actors who were not disqualified between the named steps",
      deps: ["funnel_levels", "scoped_events"],
      body: [
        "SELECT *",
        "FROM funnel_levels",
        "WHERE actor NOT IN (",
        clauses.join("\n    UNION ALL\n"),
        ")",
      ].join("\n"),
    });
    source = "funnel_kept";
    warnings.push(
      "Disqualifiers re-scan the event stream and join it back to the step bounds, so the funnel is read twice.",
    );
  }

  if (funnel.allowRetry) {
    warnings.push(
      "“Let someone try more than once” is not modelled — each actor is counted at their deepest single attempt. Multiple attempts need the stream sessionised first.",
    );
  }

  const stepArray = `ARRAY JOIN [${funnel.steps
    .map((_, index) => index + 1)
    .join(
      ", ",
    )}] AS step, [${funnel.steps.map((step) => lit(step.label)).join(", ")}] AS label`;

  const view = spec.output.funnelView ?? "steps";
  const people = grainLabel(spec.grain);
  let select: string;

  if (view === "overTime") {
    select = [
      "SELECT",
      `  ${bucket("t_1", spec.bucket.granularity)} AS period,`,
      `  count() AS started,`,
      `  countIf(level >= ${n}) AS finished,`,
      `  round(countIf(level >= ${n}) / nullIf(count(), 0), 4) AS conversion`,
      `FROM ${source}`,
      "WHERE t_1 > 0",
      "GROUP BY period",
      "ORDER BY period",
    ].join("\n");
  } else if (view === "timeToConvert") {
    select = [
      "SELECT",
      `  floor(dateDiff('minute', t_1, t_${n}) / 60) AS hours,`,
      `  count() AS ${people}`,
      `FROM ${source}`,
      `WHERE level >= ${n}`,
      "GROUP BY hours",
      "ORDER BY hours",
    ].join("\n");
  } else if (funnel.ordering === "any") {
    select = [
      "SELECT",
      "  step,",
      "  label,",
      "  " +
        funnel.steps
          .map(
            (_, index) => `countIf(step = ${index + 1} AND hit_${index + 1})`,
          )
          .join("\n    + ") +
        ` AS ${people}`,
      `FROM ${source}`,
      stepArray,
      "GROUP BY step, label",
      "ORDER BY step",
    ].join("\n");
  } else {
    select = [
      "SELECT",
      "  step,",
      "  label,",
      `  countIf(level >= step) AS ${people}`,
      `FROM ${source}`,
      stepArray,
      "GROUP BY step, label",
      "ORDER BY step",
    ].join("\n");
  }

  return { ctes, select, warnings };
};
