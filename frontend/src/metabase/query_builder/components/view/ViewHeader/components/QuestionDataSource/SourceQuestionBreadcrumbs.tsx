import type { ReactElement } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { SourceModelBreadcrumbs } from "./SourceModelBreadcrumbs";

interface Props {
  divider?: ReactElement | string;
  question: Question;
  variant: "head" | "subhead";
}

export function SourceQuestionBreadcrumbs({
  question,
  variant,
  ...props
}: Props) {
  const sourceQuestionId = Lib.primarySourceCardId(question.query());

  const { data: sourceCard } = useGetCardQuery(
    sourceQuestionId != null ? { id: sourceQuestionId } : skipToken,
  );
  const sourceQuestion = useQuestionFromCard(sourceCard);

  if (!sourceQuestion) {
    return null;
  }

  return (
    <SourceModelBreadcrumbs
      question={sourceQuestion}
      variant={variant}
      {...props}
    />
  );
}
