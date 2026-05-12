import { c, t } from "ttag";

import { Badge, Box, Code, Group, Stack, Text } from "metabase/ui";

import type { DdlExecutionStatus, DdlStatement, DdlTarget } from "../../types";

import S from "./IndexChangesSection.module.css";

type Props = {
  statements: DdlStatement[];
};

export function IndexChangesSection({ statements }: Props) {
  return (
    <Stack gap="sm">
      <Text fw="bold" fz="sm">
        {t`Index changes`}
      </Text>
      {statements.map((statement) => (
        <DdlRow key={statement.id} statement={statement} />
      ))}
    </Stack>
  );
}

function DdlRow({ statement }: { statement: DdlStatement }) {
  const executionStatus: DdlExecutionStatus =
    statement.execution_status ?? "pending";
  return (
    <Box className={S.row}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
        <Stack gap={2} miw={0}>
          <Text fz="sm" fw="bold">
            {statement.index_name || t`Index change`}
          </Text>
          <Text fz="xs" c="text-secondary">
            {targetLabel(statement.target)}
          </Text>
        </Stack>
        <Group gap="xs" wrap="nowrap">
          <ValidationBadge statement={statement} />
          <ExecutionStatusBadge status={executionStatus} />
        </Group>
      </Group>
      <Code block className={S.codeBlock}>
        {statement.statement}
      </Code>
      {statement.rationale && (
        <Text fz="xs" c="text-secondary" mt={4}>
          {statement.rationale}
        </Text>
      )}
      {statement.validation === "rejected" && statement.rejection && (
        <Text fz="xs" c="error" mt={4}>
          {c("Reason an LLM-emitted DDL was rejected by the server validator")
            .t`Rejected: ${statement.rejection.reason}`}
          {statement.rejection.detail ? ` — ${statement.rejection.detail}` : ""}
        </Text>
      )}
      {executionStatus === "failed" && statement.execution_error && (
        <Text fz="xs" c="error" mt={4}>
          {statement.execution_error}
        </Text>
      )}
    </Box>
  );
}

function ValidationBadge({ statement }: { statement: DdlStatement }) {
  if (statement.validation === "accepted") {
    return (
      <Badge variant="light" color="success" radius="sm">
        {t`Validated`}
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="error" radius="sm">
      {t`Rejected`}
    </Badge>
  );
}

function ExecutionStatusBadge({ status }: { status: DdlExecutionStatus }) {
  return (
    <Badge variant="outline" radius="sm" className={S[`status_${status}`]}>
      {executionStatusLabel(status)}
    </Badge>
  );
}

function executionStatusLabel(status: DdlExecutionStatus): string {
  switch (status) {
    case "pending":
      return t`Pending`;
    case "running":
      return t`Running`;
    case "executed":
      return t`Executed`;
    case "failed":
      return t`Failed`;
    case "skipped":
      return t`Skipped`;
  }
}

function targetLabel(target: DdlTarget): string {
  if (typeof target === "string") {
    if (target === "source-db") {
      return t`On source database`;
    }
    return t`On transform target`;
  }
  return c("Index target: another proposal in the same DAG")
    .t`On precompute of ${target["precompute-of"]}`;
}
