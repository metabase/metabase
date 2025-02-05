import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import { DataSourceCrumbs } from "./DataSourceCrumbs";
import { SourceDatasetBreadcrumbs } from "./SourceDatasetBreadcrumbs";
import { SourceQuestionBreadcrumbs } from "./SourceQuestionBreadcrumbs";
import { getDataSourceParts } from "./utils";

interface QuestionDataSourceProps {
  question: Question;
  originalQuestion?: Question;
  subHead?: boolean;
  isObjectDetail?: boolean;
  className?: string;
}

export function QuestionDataSource({
  question,
  originalQuestion,
  subHead = false,
  ...props
}: QuestionDataSourceProps) {
  if (!question) {
    return null;
  }

  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);

  const { isNative } = Lib.queryDisplayInfo(query);
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTableId);

  const variant = subHead ? "subhead" : "head";

  if (isNative || !isVirtualCardId(sourceTableId)) {
    return (
      <DataSourceCrumbs question={question} variant={variant} {...props} />
    );
  }

  if (originalQuestion?.id() === sourceQuestionId) {
    return (
      <SourceDatasetBreadcrumbs
        question={originalQuestion}
        variant={variant}
        {...props}
      />
    );
  }

  return (
    <SourceQuestionBreadcrumbs
      question={question}
      variant={variant}
      {...props}
    />
  );
}

QuestionDataSource.shouldRender = ({
  question,
  isObjectDetail = false,
}: {
  question: Question;
  isObjectDetail?: boolean;
}) => getDataSourceParts({ question, isObjectDetail }).length > 0;
