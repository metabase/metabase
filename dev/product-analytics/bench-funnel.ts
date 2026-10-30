/**
 * Benchmark the funnel query shapes in context/funnel-querying.md on synthetic
 * data: windowFunnel, the run query with joins, and the run query without
 * joins. First checks that both run queries give every person the same level
 * as windowFunnel, then times each shape on typical data and on one heavy bot.
 *
 * Usage: bun run dev/product-analytics/bench-funnel.ts [step counts...]
 * Default step counts: 3 10. Bot size: PA_BENCH_BOT_EVENTS (default 4300000).
 */

const CH = process.env.CLICKHOUSE_URL ?? "http://127.0.0.1:18123";
const BOT_EVENTS = Number(process.env.PA_BENCH_BOT_EVENTS ?? 4_300_000);
const WINDOW_SECONDS = 86_400;
// Temporary tables live for the HTTP session.
const SESSION_ID = `pa-bench-funnel-${Date.now()}`;
const QUERY_SETTINGS = {
  join_use_nulls: "1",
  max_memory_usage: "8000000000",
  max_execution_time: "180",
};

type Shape = "windowFunnel" | "joins" | "noJoins";

const SHAPES: readonly Shape[] = ["windowFunnel", "joins", "noJoins"];

type Dataset = {
  name: string;
  tableSql: (steps: number) => string;
};

type Timing = {
  dataset: string;
  steps: number;
  shape: Shape;
  ms: number | null;
  memory: string;
};

async function chQuery(
  sql: string,
  settings: Record<string, string> = {},
): Promise<string> {
  const url = new URL(CH);
  url.searchParams.set("session_id", SESSION_ID);
  for (const [key, value] of Object.entries(settings)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { method: "POST", body: sql });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 800)}`);
  }
  return text;
}

const stepNumbers = (steps: number, from = 1): number[] =>
  Array.from({ length: steps - from + 1 }, (_, index) => from + index);

const stepFlags = (steps: number): string =>
  stepNumbers(steps)
    .map((k) => `e = 'S${k}' AS step_${k}`)
    .join(", ");

const anyStep = (steps: number): string =>
  stepNumbers(steps)
    .map((k) => `step_${k}`)
    .join(" OR ");

/** 20k people, 60 events each, mostly walking through the steps in order. */
const typicalTableSql = (steps: number): string => `
CREATE TEMPORARY TABLE flagged AS
SELECT actor, ts, e, ${stepFlags(steps)}
FROM (
  SELECT
    toString(number % 20000) AS actor,
    intDiv(number, 20000) AS i,
    toDateTime('2026-01-01 00:00:00') + i * 600 + cityHash64(number, 1) % 900 AS ts,
    if(cityHash64(number, 2) % 5 = 0, 'X',
       concat('S', toString(1 + (i + cityHash64(number, 3) % 2) % ${steps}))) AS e
  FROM numbers(1200000)
)`;

/** One person repeating 7 first steps, the other steps, then something else. */
const botTableSql = (steps: number): string => {
  const pattern = [
    ...Array<string>(7).fill("S1"),
    ...stepNumbers(steps, 2).map((k) => `S${k}`),
    "X",
  ];
  return `
CREATE TEMPORARY TABLE flagged AS
SELECT
  'bot' AS actor,
  toDateTime('2026-01-01 00:00:00') + 3 * number AS ts,
  [${pattern.map((event) => `'${event}'`).join(", ")}][1 + number % ${pattern.length}] AS e,
  ${stepFlags(steps)}
FROM numbers(${BOT_EVENTS})`;
};

const DATASETS: readonly Dataset[] = [
  { name: "typical", tableSql: typicalTableSql },
  { name: "bot", tableSql: botTableSql },
];

/** Every row after this one, as a frame that only grows, so it stays linear. */
const AFTER =
  "(PARTITION BY actor ORDER BY rn DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)";

/** Step rows in a total order: by time, then by step at the same time. */
const stepRowsCte = (steps: number): string => {
  const stepOrder = `multiIf(${stepNumbers(steps - 1)
    .map((k) => `step_${k}, ${k}`)
    .join(", ")}, ${steps})`;
  return `s AS (
  SELECT actor, toUInt32(ts) AS ts, ${stepNumbers(steps)
    .map((k) => `step_${k}`)
    .join(", ")},
    row_number() OVER (PARTITION BY actor ORDER BY toUInt32(ts), ${stepOrder}) AS rn
  FROM flagged
  WHERE ${anyStep(steps)}
)`;
};

/** `chains`: each step-1 row's run, by next-step lookups joined back on (actor, rn). */
const joinsChainsSql = (steps: number): string => {
  const nexts = stepNumbers(steps, 2)
    .map((k) => `min(if(step_${k}, rn, NULL)) OVER ${AFTER} AS next_${k}`)
    .join(",\n    ");
  const times = stepNumbers(steps, 2)
    .map((k) => `r${k}.ts AS t${k}`)
    .join(", ");
  const joins = stepNumbers(steps, 2)
    .map(
      (k) =>
        `LEFT JOIN nxt AS r${k} ON r${k}.actor = r${k - 1}.actor AND r${k}.rn = r${k - 1}.next_${k}`,
    )
    .join("\n  ");
  return `WITH ${stepRowsCte(steps)},
nxt AS (SELECT *, ${nexts} FROM s),
chains AS (
  SELECT r1.actor AS actor, r1.ts AS t1, ${times}
  FROM (SELECT * FROM nxt WHERE step_1) AS r1
  ${joins}
)`;
};

/**
 * `chains` built from the last step back: `c{j}_{k}` is when the run reaches
 * step k if it starts looking for step j right after the row. A later start
 * never reaches a step earlier, so the run from the first step-j row after a
 * row is the column-wise minimum over every step-j row after it.
 */
const noJoinsChainsSql = (steps: number): string => {
  const stages = stepNumbers(steps, 2)
    .reverse()
    .map((j) => {
      const columns = [
        `min(if(step_${j}, ts, NULL)) OVER ${AFTER} AS c${j}_${j}`,
        ...stepNumbers(steps, j + 1).map(
          (k) =>
            `min(if(step_${j}, c${j + 1}_${k}, NULL)) OVER ${AFTER} AS c${j}_${k}`,
        ),
      ];
      const previous = j === steps ? "s" : `st${j + 1}`;
      return `st${j} AS (SELECT *, ${columns.join(", ")} FROM ${previous})`;
    });
  const times = stepNumbers(steps, 2)
    .map((k) => `c2_${k} AS t${k}`)
    .join(", ");
  return `WITH ${[stepRowsCte(steps), ...stages].join(",\n")},
chains AS (SELECT actor, ts AS t1, ${times} FROM st2 WHERE step_1)`;
};

/** One row per person with `level`, from `chains`. */
const runLevelsSql = (steps: number): string => {
  const ladder = stepNumbers(steps, 2)
    .reverse()
    .map((k) => `t${k} IS NOT NULL AND t${k} - t1 <= ${WINDOW_SECONDS}, ${k}`)
    .join(", ");
  return `SELECT actor, max(multiIf(${ladder}, 1)) AS level FROM chains GROUP BY actor`;
};

const windowFunnelLevelsSql = (steps: number): string =>
  `SELECT actor, windowFunnel(${WINDOW_SECONDS})(ts, ${stepNumbers(steps)
    .map((k) => `step_${k}`)
    .join(", ")}) AS level
FROM flagged
WHERE ${anyStep(steps)}
GROUP BY actor`;

const levelsSql = (shape: Shape, steps: number): string => {
  switch (shape) {
    case "windowFunnel":
      return windowFunnelLevelsSql(steps);
    case "joins":
      return `${joinsChainsSql(steps)}\n${runLevelsSql(steps)}`;
    case "noJoins":
      return `${noJoinsChainsSql(steps)}\n${runLevelsSql(steps)}`;
  }
};

/** Wrapped so a CTE-led query can be a subquery. */
const asSubquery = (sql: string): string => `(SELECT * FROM (${sql}))`;

async function loadTable(dataset: Dataset, steps: number): Promise<void> {
  await chQuery("DROP TEMPORARY TABLE IF EXISTS flagged");
  await chQuery(dataset.tableSql(steps));
}

async function countMismatches(shape: Shape, steps: number): Promise<number> {
  const text = await chQuery(
    `SELECT countIf(p.level != w.level)
FROM ${asSubquery(levelsSql(shape, steps))} AS p
FULL JOIN ${asSubquery(windowFunnelLevelsSql(steps))} AS w USING actor`,
    QUERY_SETTINGS,
  );
  return Number(text.trim());
}

async function time(
  dataset: Dataset,
  steps: number,
  shape: Shape,
): Promise<Timing> {
  const queryId = `${SESSION_ID}-${dataset.name}-${steps}-${shape}`;
  let error: string | null = null;
  try {
    await chQuery(
      `SELECT count(), max(level) FROM ${asSubquery(levelsSql(shape, steps))}`,
      { ...QUERY_SETTINGS, query_id: queryId },
    );
  } catch (caught) {
    error = String(caught).match(/Code: \d+/)?.[0] ?? "failed";
  }
  await chQuery("SYSTEM FLUSH LOGS");
  const [ms = NaN, bytes = NaN] = (
    await chQuery(
      `SELECT query_duration_ms, memory_usage FROM system.query_log
WHERE query_id = '${queryId}' AND type != 'QueryStart'
FORMAT TSV`,
    )
  )
    .trim()
    .split("\t")
    .map(Number);
  const memory = `${Math.round(bytes / 2 ** 20)} MiB`;
  return {
    dataset: dataset.name,
    steps,
    shape,
    ms: error === null ? ms : null,
    memory: error === null ? memory : `${error} at ${memory}`,
  };
}

async function main(): Promise<void> {
  const stepCounts = process.argv.slice(2).map(Number);
  const timings: Timing[] = [];
  for (const steps of stepCounts.length > 0 ? stepCounts : [3, 10]) {
    for (const dataset of DATASETS) {
      await loadTable(dataset, steps);
      if (dataset.name === "typical") {
        for (const shape of ["joins", "noJoins"] as const) {
          const mismatches = await countMismatches(shape, steps);
          console.log(
            `${steps} steps, ${shape}: ${mismatches} people with a different level from windowFunnel`,
          );
        }
      }
      for (const shape of SHAPES) {
        timings.push(await time(dataset, steps, shape));
      }
    }
  }
  console.table(timings);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
