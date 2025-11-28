import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import { DataSourceCrumbs } from "./DataSourceCrumbs";
import { SourceModelBreadcrumbs } from "./SourceModelBreadcrumbs";
import { SourceQuestionBreadcrumbs } from "./SourceQuestionBreadcrumbs";
import { SourceTableBreadcrumbs } from "./SourceTableBreadcrumbs";
import { getDataSourceParts } from "./utils";

interface QuestionDataSourceProps {
  className?: string;
  question: Question;
  originalQuestion?: Question;
  subHead?: boolean;
  isObjectDetail?: boolean;
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

  if (isNative) {
    return (
      <DataSourceCrumbs question={question} variant={variant} {...props} />
    );
  }

  if (!isVirtualCardId(sourceTableId)) {
    return (
      <SourceTableBreadcrumbs
        question={question}
        variant={variant}
        {...props}
      />
    );
  }

  if (originalQuestion?.id() === sourceQuestionId) {
    return (
      <SourceModelBreadcrumbs
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
