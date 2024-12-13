import type { ReactNode } from "react";

import Questions from "metabase/entities/questions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
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

  return (
    <Questions.Loader id={sourceQuestionId} loadingAndErrorWrapper={false}>
      {({ question: sourceQuestion }) => {
        if (!sourceQuestion) {
          return null;
        }

        if (
          sourceQuestion.type() === "model" ||
          sourceQuestion.type() === "metric"
        ) {
          return (
            <SourceDatasetBreadcrumbs
              question={sourceQuestion}
              variant={variant}
              {...props}
            />
          );
        }
        return (
          <DataSourceCrumbs question={question} variant={variant} {...props} />
        );
      }}
    </Questions.Loader>
  );
}
