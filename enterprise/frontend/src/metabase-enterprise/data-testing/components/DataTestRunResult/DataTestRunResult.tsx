import { msgid, ngettext, t } from "ttag";

import { Box, Group, Stack, Text, Title } from "metabase/ui";
import type {
  DataTestRow,
  DataTestRowsData,
  DataTestRunStoredResult,
  TransformTestExpectationResult,
} from "metabase-types/api";

import {
  formatDataTestRunStatus,
  isFailedDataTestRunStatus,
} from "../../utils";
import { DataTestDataCard } from "../DataTestDataCard";

type DataTestRunResultProps = {
  result: DataTestRunStoredResult;
};

export function DataTestRunResult({ result }: DataTestRunResultProps) {
  return (
    <Stack component="section" aria-label={t`Result`} gap="lg">
      <Title order={4}>{t`Result`}</Title>
      {"expectations" in result ? (
        result.expectations.map((expectation) => (
          <ExpectationResult key={expectation.name} expectation={expectation} />
        ))
      ) : (
        <Text c="feedback-negative">{result.message}</Text>
      )}
    </Stack>
  );
}

type ExpectationResultProps = {
  expectation: TransformTestExpectationResult;
};

function ExpectationResult({ expectation }: ExpectationResultProps) {
  const { name, status, error, truncated = 0 } = expectation;
  const columns = (expectation.columns ?? []).map((column) => ({
    name: column.name,
    cast_type: column.database_type,
  }));

  return (
    <Stack role="group" aria-label={name} gap="sm">
      <Group justify="space-between" align="start" wrap="nowrap" gap="md">
        <Text fw="bold">{name}</Text>
        <Box
          c={
            isFailedDataTestRunStatus(status) ? "feedback-negative" : undefined
          }
        >
          {formatDataTestRunStatus(status)}
        </Box>
      </Group>
      {error != null && <Text c="feedback-negative">{error.message}</Text>}
      {getRowLists(expectation).map(({ label, rows }) => (
        <DataTestDataCard
          key={label}
          name={label}
          icon="table2"
          description={getRowCountLabel(rows.length)}
          data={{ format: "rows", columns, rows } satisfies DataTestRowsData}
        />
      ))}
      {truncated > 0 && (
        <Text c="text-secondary">
          {ngettext(
            msgid`${truncated} more row is not shown.`,
            `${truncated} more rows are not shown.`,
            truncated,
          )}
        </Text>
      )}
    </Stack>
  );
}

type RowList = {
  label: string;
  rows: DataTestRow[];
};

function getRowLists(expectation: TransformTestExpectationResult): RowList[] {
  const rowLists =
    expectation.type === "empty"
      ? [{ label: t`Rows the query returned`, rows: expectation.sample ?? [] }]
      : [
          {
            label: t`Unexpected rows`,
            rows: expectation["extra-rows"] ?? [],
          },
          { label: t`Missing rows`, rows: expectation["missing-rows"] ?? [] },
        ];
  return rowLists.filter(({ rows }) => rows.length > 0);
}

function getRowCountLabel(count: number) {
  return ngettext(msgid`${count} row`, `${count} rows`, count);
}
