import { type ReactNode, useMemo } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

import { DataSourceCrumbs } from "./DataSourceCrumbs";
import { SourceDatasetBreadcrumbs } from "./SourceDatasetBreadcrumbs";

interface Props {
  divider: ReactNode;
  question: Question;
  variant: "head" | "subhead";
}

export function SourceQuestionBreadcrumbs({
  question,
  variant,
  ...props
}: Props) {
  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTableId);

  const { data: sourceCard } = useGetCardQuery(
    sourceQuestionId != null ? { id: sourceQuestionId } : skipToken,
  );
  const metadata = useSelector(getMetadata);
  const sourceQuestion = useMemo(() => {
    return sourceCard ? new Question(sourceCard, metadata) : undefined;
  }, [sourceCard, metadata]);

  if (!sourceQuestion) {
    return null;
  }

  if (sourceQuestion.type() === "model" || sourceQuestion.type() === "metric") {
    return (
      <SourceDatasetBreadcrumbs
        question={sourceQuestion}
        variant={variant}
        {...props}
      />
    );
  }

  return <DataSourceCrumbs question={question} variant={variant} {...props} />;
}
