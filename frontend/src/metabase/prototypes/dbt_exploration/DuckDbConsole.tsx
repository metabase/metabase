import { type KeyboardEvent, useState } from "react";
import { match } from "ts-pattern";

import { Button, Group, Loader, Stack, Text, Textarea } from "metabase/ui";

import S from "./DbtExploration.module.css";
import { ResultTableView } from "./ResultTableView";
import { runQuery } from "./duckdb";
import { RESULTS } from "./results.generated";
import type { ResultTable } from "./types";

const PRESETS = [
  { label: "Invoices", sql: "SELECT * FROM invoices ORDER BY invoice_date;" },
  {
    label: "Time entries",
    sql: "SELECT * FROM time_entries ORDER BY entry_date;",
  },
  {
    label: "Fan-out rows",
    sql: `-- The rows the naive join aggregates: each invoice once per time entry.
SELECT i.invoice_id, i.amount, t.entry_id, t.hours
FROM fct_invoices i
JOIN fct_time_entries t
  ON t.customer_id = i.customer_id
 AND date_trunc('month', t.entry_date) = date_trunc('month', i.invoice_date)
WHERE i.status = 'paid' AND t.is_billable
ORDER BY 1, 3;`,
  },
  { label: "Naive join", sql: RESULTS.files["naive_join.sql"] ?? "" },
  { label: "MetricFlow SQL", sql: RESULTS.files["generated.sql"] ?? "" },
];

type QueryState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; table: ResultTable; durationMs: number }
  | { status: "error"; message: string };

/**
 * A SQL editor over an in-browser DuckDB holding the dbt project's seeds and
 * models. Cmd/Ctrl+Enter runs the query.
 */
export function DuckDbConsole() {
  const [sql, setSql] = useState(PRESETS[0].sql);
  const [state, setState] = useState<QueryState>({ status: "idle" });

  const run = async (query: string) => {
    setState({ status: "running" });
    const startMs = performance.now();
    try {
      const table = await runQuery(query);
      setState({
        status: "done",
        table,
        durationMs: performance.now() - startMs,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run(sql);
    }
  };

  const handlePreset = (presetSql: string) => {
    setSql(presetSql);
    run(presetSql);
  };

  return (
    <Stack gap="sm" className={S.panel}>
      <Group gap="xs">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="compact-sm"
            variant="default"
            onClick={() => handlePreset(preset.sql)}
          >
            {preset.label}
          </Button>
        ))}
      </Group>
      <Textarea
        value={sql}
        onChange={(event) => setSql(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        autosize
        minRows={4}
        maxRows={20}
        classNames={{ input: S.sqlInput }}
        aria-label="SQL"
      />
      <Group justify="space-between">
        <Text size="sm" c="text-secondary">
          Tables: customers, invoices, time_entries (and the dbt models
          dim_customers, fct_invoices, fct_time_entries). The first run loads
          DuckDB.
        </Text>
        <Button
          variant="filled"
          onClick={() => run(sql)}
          loading={state.status === "running"}
        >
          Run
        </Button>
      </Group>
      {match(state)
        .with({ status: "idle" }, () => null)
        .with({ status: "running" }, () => <Loader size="sm" />)
        .with({ status: "error" }, ({ message }) => (
          <Text className={S.error}>{message}</Text>
        ))
        .with({ status: "done" }, ({ table, durationMs }) => (
          <Stack gap="xs">
            <Text size="sm" c="text-secondary">
              {table.rows.length} rows in {Math.round(durationMs)} ms
            </Text>
            <ResultTableView table={table} />
          </Stack>
        ))
        .exhaustive()}
    </Stack>
  );
}
