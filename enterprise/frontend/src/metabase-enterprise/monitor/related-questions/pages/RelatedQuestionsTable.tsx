import { t } from "ttag";

import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "metabase/admin/components/AdminDataTable";
import { Link } from "metabase/common/components/Link";
import { Box, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { RelatedQuestion, RelatedQuestionsRow } from "metabase-types/api";

import S from "./RelatedQuestionsTable.module.css";

function QuestionLink({ question }: { question: RelatedQuestion }) {
  return (
    <Link
      to={Urls.card({ id: question.id, name: question.name })}
      variant="brand"
      className={S.questionLink}
    >
      <Icon
        name="table"
        size={16}
        className={S.questionIcon}
        style={{ marginRight: "0.5rem" }}
        aria-hidden
      />
      <span>{question.name}</span>
    </Link>
  );
}

export function RelatedQuestionsTable({
  rows,
}: {
  rows: RelatedQuestionsRow[];
}) {
  const columns: AdminDataTableColumn<RelatedQuestionsRow>[] = [
    {
      key: "question",
      title: t`Question`,
      headerProps: { style: { width: "45%" } },
      render: (row) => <QuestionLink question={row.question} />,
    },
    {
      key: "related_questions",
      title: t`Related questions`,
      render: (row) => (
        <Stack gap="sm">
          {row.related_questions.map((relatedQuestion) => (
            <QuestionLink key={relatedQuestion.id} question={relatedQuestion} />
          ))}
        </Stack>
      ),
    },
  ];

  return (
    <Box
      data-testid="related-questions-table"
      mih={0}
      style={{ overflow: "auto" }}
    >
      <AdminDataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.question.id}
        tableClassName={S.table}
        maxBodyHeight="calc(100vh - 18rem)"
      />
    </Box>
  );
}
