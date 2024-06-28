import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  runQuestionQuery,
  updateQuestion,
} from "metabase/query_builder/actions";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  getIsDirty,
  getIsResultDirty,
  getIsRunnable,
} from "metabase/query_builder/selectors";
import { getSetting } from "metabase/selectors/settings";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

type NotebookProps = { onApply?: () => void };

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  const { question } = useInteractiveQuestionData();

  const isDirty = useSelector(getIsDirty);
  const isRunnable = useSelector(getIsRunnable);
  const isResultDirty = useSelector(getIsResultDirty);
  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );

  const dispatch = useDispatch();

  return (
    question && (
      <QBNotebook
        question={question}
        isDirty={isDirty}
        isRunnable={isRunnable}
        isResultDirty={Boolean(isResultDirty)}
        reportTimezone={reportTimezone}
        readOnly={false}
        updateQuestion={(question: Question) =>
          dispatch(updateQuestion(question))
        }
        runQuestionQuery={() => dispatch(runQuestionQuery())}
        setQueryBuilderMode={onApply}
        hasVisualizeButton={true}
      />
    )
  );
};
