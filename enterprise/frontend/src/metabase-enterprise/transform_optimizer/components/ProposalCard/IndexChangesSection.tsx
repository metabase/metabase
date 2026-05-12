import { c, t } from "ttag";

import { Box, Code, Stack, Text } from "metabase/ui";

import type { DdlStatement, DdlTarget } from "../../types";

import S from "./IndexChangesSection.module.css";

type Props = {
  /** One DDL per `:index` proposal in this branch. */
  statements: DdlStatement[];
};

/**
 * Render the DDL block on a proposal card. With one-change-per-proposal
 * the proposal's `rationale` already explains *why* the index helps, so
 * we deliberately do NOT also render `ddl_statement.rationale` — that
 * duplication is the recent complaint. We show only what's not on the
 * parent card already: the target hint and the SQL statement itself.
 * Rejected DDL keeps a one-line failure note.
 */
export function IndexChangesSection({ statements }: Props) {
  return (
    <Stack gap="sm">
      {statements.map((statement, i) => (
        <DdlRow
          key={`${statement.index_name ?? "ddl"}-${i}`}
          statement={statement}
        />
      ))}
    </Stack>
  );
}

function DdlRow({ statement }: { statement: DdlStatement }) {
  return (
    <Box className={S.row}>
      <Text fz="xs" c="text-secondary" mb={4}>
        {targetLabel(statement.target)}
      </Text>
      <Code block className={S.codeBlock}>
        {statement.statement}
      </Code>
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
  if (target === "source-db") {
    return t`On source database`;
  }
  return t`On a new transform target (created by a linked proposal)`;
}
