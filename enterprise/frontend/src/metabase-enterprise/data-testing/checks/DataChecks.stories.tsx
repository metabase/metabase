import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { Box, Card, Stack, Text, Title } from "metabase/ui";

import {
  DataCheckCoverage,
  DataCheckForm,
  DataCheckList,
  DataCheckResultCard,
  HistoryBandView,
} from "./components";
import { DQ_FIXTURE, DQ_TABLES, HAND_WRITTEN_VOLUME_HISTORY } from "./fixtures";
import type {
  DataCheckDefinition,
  DataCheckResult,
  DataCheckRun,
  DataCheckStatus,
} from "./types";

const meta: Meta = {
  title: "Enterprise/Data Checks (prototype)",
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj;

function getExample(check: string) {
  const example = DQ_FIXTURE.examples.find(
    ({ definition }) => definition.check === check,
  );
  if (example == null) {
    throw new Error(`No fixture for ${check}`);
  }
  return example;
}

function failing(check: string): DataCheckRun {
  const { definition, failing: result } = getExample(check);
  return { definition, result };
}

function passing(check: string): DataCheckRun {
  const { definition, passing: result } = getExample(check);
  return { definition, result };
}

function extra(check: string, status: DataCheckStatus): DataCheckRun {
  const run = DQ_FIXTURE.extras.find(
    ({ result }) => result.check === check && result.status === status,
  );
  if (run == null) {
    throw new Error(`No ${status} fixture for ${check}`);
  }
  return run;
}

function unsupportedRuns(): DataCheckRun[] {
  return DQ_FIXTURE.extras.filter(
    ({ result }) => result.reason === "unsupported",
  );
}

function renamed(run: DataCheckRun, check: string, name: string): DataCheckRun {
  return {
    definition: { ...run.definition, check, name },
    result: { ...run.result, check, display: name },
  };
}

type PageProps = {
  title: string;
  description: string;
  width?: string;
  children: ReactNode;
};

function Page({ title, description, width = "52rem", children }: PageProps) {
  return (
    <Box bg="background_page-secondary" mih="100vh" p="xl">
      <Stack gap="lg" maw={width} mx="auto">
        <Stack gap="xs">
          <Title order={3}>{title}</Title>
          <Text c="text-secondary">{description}</Text>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}

function Results({ runs }: { runs: DataCheckRun[] }) {
  return (
    <>
      {runs.map((run) => (
        <DataCheckResultCard key={run.result.id + run.result.status} {...run} />
      ))}
    </>
  );
}

export const FailingRows: Story = {
  render: () => (
    <Page
      title="Failing rows"
      description="Row checks count violating rows and sample them. The checked columns are marked. 24 check types use this view."
    >
      <Results
        runs={[
          failing("accepted_values"),
          failing("column_a_lte_column_b"),
          extra("expression_is_true", "warn"),
          failing("unique_combination"),
          failing("row_count_in_partition_at_least"),
          passing("not_null"),
          extra("not_null", "error"),
        ]}
      />
    </Page>
  ),
};

export const MetricBand: Story = {
  render: () => (
    <Page
      title="Metric against a band"
      description="Table checks that compute one number and compare it with a minimum, a maximum or both. 14 check types use this view."
    >
      <Results
        runs={[
          failing("null_proportion_at_most"),
          extra("freshness_within", "warn"),
          failing("aggregate_between"),
          failing("row_count_between"),
          passing("value_share_between"),
          passing("row_count_at_least"),
          extra("aggregate_between", "error"),
        ]}
      />
    </Page>
  ),
};

export const TableComparison: Story = {
  render: () => (
    <Page
      title="Two-table comparison"
      description="Reconciliation checks measure the same thing on two tables. 5 check types use this view."
    >
      <Results
        runs={[
          failing("aggregate_equals_other"),
          extra("row_count_equals_other", "warn"),
          failing("columns_equal_across_tables"),
          failing("cardinality_equals"),
          passing("row_count_fewer_than_other"),
          extra("row_count_equals_other", "error"),
        ]}
      />
    </Page>
  ),
};

export const ExpectedFound: Story = {
  render: () => (
    <Page
      title="Expected against found"
      description="Schema checks and set checks compare a declared list with what the warehouse has. 4 check types use this view."
    >
      <Results
        runs={[
          failing("schema_matches"),
          extra("schema_matches", "warn"),
          failing("column_type"),
          failing("column_exists"),
          failing("most_common_value_in"),
          passing("schema_matches"),
          extra("schema_matches", "error"),
        ]}
      />
    </Page>
  ),
};

export const SequenceGaps: Story = {
  render: () => (
    <Page
      title="Sequence gaps"
      description="Checks on series: missing values of a spine, or a break between one row and the next. 5 check types use this view."
    >
      <Results
        runs={[
          failing("partition_complete_through"),
          extra("no_gaps_in_spine", "warn"),
          failing("sequential_values"),
          failing("monotonic"),
          failing("mutually_exclusive_ranges"),
          passing("no_gaps_in_spine"),
        ]}
      />
    </Page>
  ),
};

export const HistoryChecks: Story = {
  render: () => (
    <Page
      title="Metric over time (not supported in v1)"
      description="9 check types compare with earlier runs. The chart is a hand-written mock of what a result could look like once runs are stored. Below it are real results: the reference implementation reports these checks as unsupported."
    >
      <Card withBorder shadow="none" p="lg">
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={5}>Mock: volume_anomaly on orders</Title>
            <Text c="text-secondary">
              Hand-written data, not dq output. Rows per day against a band
              learned per weekday.
            </Text>
          </Stack>
          <HistoryBandView
            points={HAND_WRITTEN_VOLUME_HISTORY}
            unit="rows on 2026-11-23"
          />
        </Stack>
      </Card>
      <Results runs={unsupportedRuns().slice(0, 3)} />
    </Page>
  ),
};

const UNKNOWN_TYPE_RUNS: DataCheckRun[] = [
  renamed(failing("valid_format"), "valid_iban", "payer IBANs are well formed"),
  renamed(
    failing("aggregate_equals_other"),
    "aggregate_ratio_between_tables",
    "mart revenue is in line with orders",
  ),
  renamed(
    failing("null_proportion_at_most"),
    "blank_proportion_at_most",
    "country is rarely blank",
  ),
  renamed(passing("unique"), "unique_ignoring_case", "emails are unique"),
  extra("not_a_real_check", "error"),
];

export const UnknownCheckType: Story = {
  render: () => (
    <Page
      title="A check type this frontend does not know"
      description="mbcode can run a newer Metabase than the main instance. These are real results with the check renamed to a type the catalogue does not have, plus the validation error dq reports for an unknown check."
    >
      <Results runs={UNKNOWN_TYPE_RUNS} />
    </Page>
  ),
};

export const ChecksOnATable: Story = {
  render: () => (
    <Page
      title="Checks on orders"
      description="The 33 checks of examples/suite/orders.yaml run against the defective fixture, plus the history checks that target orders."
      width="84rem"
    >
      <DataCheckList
        runs={DQ_FIXTURE.ordersSuite}
        defaultSelectedId={DQ_FIXTURE.ordersSuite[0]?.result.id}
      />
    </Page>
  ),
};

export const ChecksOnATableWarnings: Story = {
  render: () => (
    <Page
      title="Checks on daily_revenue"
      description="A smaller list with warnings, a failure and a check that could not run."
      width="84rem"
    >
      <DataCheckList
        runs={[
          extra("freshness_within", "warn"),
          extra("row_count_equals_other", "warn"),
          extra("no_gaps_in_spine", "warn"),
          failing("aggregate_equals_other"),
          failing("partition_complete_through"),
          extra("row_count_equals_other", "error"),
          extra("metric_change_within", "error"),
          passing("expression_is_true"),
          passing("sequential_values"),
        ]}
        defaultSelectedId={extra("freshness_within", "warn").result.id}
      />
    </Page>
  ),
};

function FormPage({ definition }: { definition: DataCheckDefinition }) {
  return (
    <Page
      title={`Edit check: ${definition.check}`}
      description="One form for every check type, built from the parameter types of the catalogue. The YAML is what gets stored."
      width="68rem"
    >
      <DataCheckForm initialDefinition={definition} tables={DQ_TABLES} />
    </Page>
  );
}

export const EditRowCheck: Story = {
  render: () => <FormPage definition={failing("accepted_values").definition} />,
};

export const EditBandCheck: Story = {
  render: () => (
    <FormPage definition={failing("aggregate_between").definition} />
  ),
};

export const EditComparisonCheck: Story = {
  render: () => (
    <FormPage definition={failing("aggregate_equals_other").definition} />
  ),
};

export const EditSchemaCheck: Story = {
  render: () => <FormPage definition={failing("schema_matches").definition} />,
};

export const EditGapsCheck: Story = {
  render: () => (
    <FormPage definition={failing("partition_complete_through").definition} />
  ),
};

export const EditHistoryCheck: Story = {
  render: () => (
    <FormPage definition={extra("volume_anomaly", "error").definition} />
  ),
};

export const EditUnknownCheck: Story = {
  render: () => <FormPage definition={UNKNOWN_TYPE_RUNS[1].definition} />,
};

const HOSTILE_RESULT: DataCheckResult = {
  id: "future.yaml#0",
  display: "drift_score orders total_amount",
  check: "drift_score",
  table: "orders",
  severity: "error",
  status: "fail",
  metric: { score: 0.41, buckets: [0.1, 0.3, 0.6], reference: null },
  threshold: { max: 0.2 },
  "failing-rows": [
    { bucket: "0-100", share: 0.1, expected: 0.3 },
    { bucket: "100-1000", share: 0.3, note: "wider than before" },
  ],
  "duration-ms": 12,
};

export const UnknownResultShape: Story = {
  render: () => (
    <Page
      title="A result shape nobody planned for"
      description="Hand-written: a nested metric, a nested threshold, rows with different keys and no message. The generic view still shows all of it."
    >
      <DataCheckResultCard
        definition={{
          check: "drift_score",
          table: "orders",
          params: { column: "total_amount", reference: { run: "previous" } },
        }}
        result={HOSTILE_RESULT}
      />
    </Page>
  ),
};

export const CoverageMap: Story = {
  render: () => (
    <Page
      title="Coverage map"
      description="Every check type of the catalogue and the view that shows its result."
      width="84rem"
    >
      <DataCheckCoverage />
    </Page>
  ),
};
