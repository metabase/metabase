import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Anchor,
  Badge,
  Box,
  Card,
  Ellipsified,
  Group,
  Stack,
  Text,
  Title,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  DataTestResultColumn,
  DataTestRow,
  DataTestRunStoredResult,
  TransformTestExpectationResult,
} from "metabase-types/api";

import {
  formatDataTestRunStatus,
  getExpectationAnchor,
  isFailedDataTestRunStatus,
} from "../../utils";

import S from "./DataTestRunResult.module.css";

type DataTestRunResultProps = {
  result: DataTestRunStoredResult;
  testUrl: string;
};

export function DataTestRunResult({ result, testUrl }: DataTestRunResultProps) {
  return (
    <Stack component="section" aria-label={t`Result`} gap="lg">
      <Title order={4}>{t`Result`}</Title>
      {"expectations" in result ? (
        result.expectations.map((expectation) => (
          <ExpectationResult
            key={expectation.name}
            expectation={expectation}
            testUrl={testUrl}
          />
        ))
      ) : (
        <Text c="feedback-negative">{result.message}</Text>
      )}
    </Stack>
  );
}

type ExpectationResultProps = {
  expectation: TransformTestExpectationResult;
  testUrl: string;
};

function ExpectationResult({ expectation, testUrl }: ExpectationResultProps) {
  const { name, status, error, columns = [], truncated = 0 } = expectation;
  const rows = useMemo(() => getDiffRows(expectation), [expectation]);
  const rowCountLabel = getRowCountLabel(expectation);

  return (
    <Stack role="group" aria-label={name} gap="sm">
      <Group justify="space-between" align="start" wrap="nowrap" gap="md">
        <Anchor
          component={Link}
          to={`${testUrl}#${getExpectationAnchor(name)}`}
          fw="bold"
        >
          {name}
        </Anchor>
        <Badge
          color={isFailedDataTestRunStatus(status) ? "negative" : "positive"}
          size="sm"
          flex="none"
        >
          {formatDataTestRunStatus(status)}
        </Badge>
      </Group>
      {error != null && <Text c="feedback-negative">{error.message}</Text>}
      {rows.length > 0 && (
        <>
          {rowCountLabel != null && (
            <Text c="text-secondary">{rowCountLabel}</Text>
          )}
          <DiffTable name={name} columns={columns} rows={rows} />
        </>
      )}
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

type DiffRowKind = "unexpected" | "missing";

type DiffRow = {
  id: string;
  kind: DiffRowKind;
  row: DataTestRow;
};

function getDiffRows(expectation: TransformTestExpectationResult): DiffRow[] {
  const unexpected =
    expectation.type === "empty"
      ? (expectation.sample ?? [])
      : (expectation["extra-rows"] ?? []);
  const missing =
    expectation.type === "empty" ? [] : (expectation["missing-rows"] ?? []);

  return [
    ...unexpected.map((row, index) => ({
      id: `unexpected-${index}`,
      kind: "unexpected" as const,
      row,
    })),
    ...missing.map((row, index) => ({
      id: `missing-${index}`,
      kind: "missing" as const,
      row,
    })),
  ];
}

function getRowCountLabel(expectation: TransformTestExpectationResult) {
  if (expectation.type === "empty") {
    return t`Expected no rows`;
  }
  const rowCounts = expectation["row-counts"];
  if (rowCounts == null) {
    return null;
  }
  const { actual, expected } = rowCounts;
  const returnedLabel = ngettext(
    msgid`Returned ${actual} row`,
    `Returned ${actual} rows`,
    actual,
  );
  return t`${returnedLabel}, expected ${expected}`;
}

function getKindLabel(kind: DiffRowKind) {
  return kind === "unexpected" ? t`+ Unexpected` : t`− Missing`;
}

type DiffTableProps = {
  name: string;
  columns: DataTestResultColumn[];
  rows: DiffRow[];
};

function DiffTable({ name, columns, rows }: DiffTableProps) {
  const tableColumns = useMemo(
    (): TreeTableColumnDef<DiffRow>[] => [
      {
        id: "kind",
        header: "",
        accessorFn: (entry) => getKindLabel(entry.kind),
        width: "auto",
        cell: ({ row, getValue }) => (
          <Box
            fw="bold"
            fz="sm"
            c={
              row.original.kind === "unexpected"
                ? "feedback-negative"
                : "feedback-warning"
            }
          >
            {String(getValue())}
          </Box>
        ),
      },
      ...columns.map(
        (column): TreeTableColumnDef<DiffRow> => ({
          id: column.name,
          header: column.name,
          accessorFn: (entry) => formatValue(entry.row[column.name]),
          minWidth: 80,
          cell: ({ getValue }) => (
            <Ellipsified data-row-value>{String(getValue())}</Ellipsified>
          ),
        }),
      ),
    ],
    [columns],
  );

  const instance = useTreeTableInstance({
    data: rows,
    columns: tableColumns,
    getNodeId: (entry) => entry.id,
  });

  return (
    <Card className={S.rows} withBorder p={0}>
      <TreeTable
        instance={instance}
        static
        ariaLabel={t`Differences of ${name}`}
        getRowProps={(row) => ({ "data-row-kind": row.original.kind })}
      />
    </Card>
  );
}

function formatValue(value: DataTestRow[string] | undefined): string {
  return value === undefined ? "" : String(value);
}
