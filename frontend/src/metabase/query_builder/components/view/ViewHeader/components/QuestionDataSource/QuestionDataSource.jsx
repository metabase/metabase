import PropTypes from "prop-types";

import * as Lib from "metabase-lib";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import { DataSourceCrumbs } from "./DataSourceCrumbs";
import { SourceDatasetBreadcrumbs } from "./SourceDatasetBreadcrumbs";
import { SourceQuestionBreadcrumbs } from "./SourceQuestionBreadcrumbs";
import { getDataSourceParts } from "./utils";

QuestionDataSource.propTypes = {
  question: PropTypes.object,
  originalQuestion: PropTypes.object,
  subHead: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
};

export function QuestionDataSource({
  question,
  originalQuestion,
  subHead = false,
  ...props
}) {
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

QuestionDataSource.shouldRender = ({ question, isObjectDetail = false }) =>
  getDataSourceParts({ question, isObjectDetail }).length > 0;
