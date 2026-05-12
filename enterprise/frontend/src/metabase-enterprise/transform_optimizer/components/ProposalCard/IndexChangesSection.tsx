import { c, t } from "ttag";

import { Box, Code, Stack, Text } from "metabase/ui";

import type { DdlStatement, DdlTarget } from "../../types";

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
  return (
    <Box className={S.row}>
      <Stack gap={2} miw={0} mb={4}>
        <Text fz="sm" fw="bold">
          {statement.index_name || t`Index change`}
        </Text>
        <Text fz="xs" c="text-secondary">
          {targetLabel(statement.target)}
        </Text>
      </Stack>
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
    </Box>
  );
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
