import { Code, List, SimpleGrid, Stack, Tabs, Title } from "metabase/ui";

import S from "./DbtExploration.module.css";
import { DuckDbConsole } from "./DuckDbConsole";
import { ResultPanel } from "./ResultTableView";
import { RESULTS } from "./results.generated";

const FILE_ORDER = [
  "metrics.yml",
  "semantic_models.yml",
  "generated.sql",
  "naive_join.sql",
  "invoices.csv",
  "time_entries.csv",
  "customers.csv",
];

/**
 * Revenue per billable hour across two fact tables, computed by dbt
 * MetricFlow on DuckDB, next to the naive join that double counts. The data
 * comes from `project/run.sh`.
 */
export function DbtCrossFactPrototype() {
  return (
    <Stack gap="xl" maw={1200}>
      <Stack gap="sm">
        <Title order={4}>How MetricFlow computes it</Title>
        <List size="sm" spacing="xs">
          <List.Item>
            Both semantic models set an <Code>agg_time_dimension</Code> (
            <Code>invoice_date</Code>, <Code>entry_date</Code>); both become the
            shared <Code>metric_time</Code>.
          </List.Item>
          <List.Item>
            Both declare the <Code>customer</Code> entity, so customer
            dimensions are reachable from either fact table.
          </List.Item>
          <List.Item>
            Each input metric is aggregated on its own table, with its own
            filter, at the requested grain.
          </List.Item>
          <List.Item>
            The aggregates are <Code>FULL OUTER JOIN</Code>ed on the group-by
            columns, then the derived expression runs. Rows are never
            multiplied.
          </List.Item>
        </List>
      </Stack>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <ResultPanel
          title="MetricFlow"
          caption="Aggregate each fact, then join. Months with only invoices or only hours are kept."
          table={RESULTS.byMonthCustomer}
        />
        <ResultPanel
          title="Naive join (wrong)"
          caption="Join the facts, then aggregate. Each invoice repeats once per time entry: Acme's January revenue triples. Unmatched months drop out."
          table={RESULTS.naiveJoin}
        />
      </SimpleGrid>

      <ResultPanel
        title="By month"
        caption="Same metric without the customer: the join is on metric_time alone."
        table={RESULTS.byMonth}
      />

      <Stack gap="sm">
        <Title order={4}>Query the data (DuckDB in the browser)</Title>
        <DuckDbConsole />
      </Stack>

      <Stack gap="sm">
        <Title order={4}>Project files</Title>
        <Tabs defaultValue={FILE_ORDER[0]}>
          <Tabs.List>
            {FILE_ORDER.map((name) => (
              <Tabs.Tab key={name} value={name}>
                {name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {FILE_ORDER.map((name) => (
            <Tabs.Panel key={name} value={name} pt="md">
              <Code block className={S.code}>
                {RESULTS.files[name] ?? ""}
              </Code>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>
    </Stack>
  );
}
