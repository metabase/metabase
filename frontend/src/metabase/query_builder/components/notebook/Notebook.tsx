import React from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import Questions from "metabase/entities/questions";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/metadata/utils/saved-questions";
import NotebookSteps from "./NotebookSteps";
import { NotebookRoot } from "./Notebook.styled";

interface NotebookOwnProps {
  className?: string;
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  reportTimezone: string;
  hasVisualizeButton?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => void;
  setQueryBuilderMode: (mode: string) => void;
  readOnly?: boolean;
}

interface EntityLoaderProps {
  sourceQuestion?: Question;
}

type NotebookProps = NotebookOwnProps & EntityLoaderProps;

const Notebook = ({ className, ...props }: NotebookProps) => {
  const {
    question,
    isDirty,
    isRunnable,
    isResultDirty,
    hasVisualizeButton = true,
    updateQuestion,
    runQuestionQuery,
    setQueryBuilderMode,
  } = props;

  // When switching out of the notebook editor, cleanupQuestion accounts for
  // post aggregation filters and otherwise nested queries with duplicate column names.
  async function cleanupQuestion() {
    let cleanQuestion = question.setQuery(question.query().clean());
    if (cleanQuestion.display() === "table") {
      cleanQuestion = cleanQuestion.setDefaultDisplay();
    }

    await updateQuestion(cleanQuestion);
  }

  // visualize switches the view to the question's visualization.
  async function visualize() {
    // Only cleanup the question if it's dirty, otherwise Metabase
    // will incorrectly display the Save button, even though there are no changes to save.
    if (isDirty) {
      cleanupQuestion();
    }
    // switch mode before running otherwise URL update may cause it to switch back to notebook mode
    await setQueryBuilderMode("view");
    if (isResultDirty) {
      await runQuestionQuery();
    }
  }

  return (
    <NotebookRoot className={className}>
      <NotebookSteps {...props} />
      {hasVisualizeButton && isRunnable && (
        <Button medium primary style={{ minWidth: 220 }} onClick={visualize}>
          {t`Visualize`}
        </Button>
      )}
    </NotebookRoot>
  );
};

function getSourceQuestionId(question: Question) {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    const sourceTableId = query.sourceTableId();
    if (isVirtualCardId(sourceTableId)) {
      return getQuestionIdFromVirtualTableId(sourceTableId);
    }
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: (state: State, { question }: NotebookOwnProps) =>
      getSourceQuestionId(question),
    entityAlias: "sourceQuestion",
    loadingAndErrorWrapper: false,
  }),
)(Notebook);
