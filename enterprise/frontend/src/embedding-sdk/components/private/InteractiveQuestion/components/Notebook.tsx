import { useMemo } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { default as QBNotebook } from "metabase/query_builder/components/notebook/Notebook";
import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

type NotebookProps = { onApply?: () => void };

export const Notebook = ({ onApply = () => {} }: NotebookProps) => {
  // Loads databases and metadata so we can show notebook steps for the selected data source
  useDatabaseListQuery();

  const { question, originalQuestion, updateQuestion, runQuestion } =
    useInteractiveQuestionContext();

  const isDirty = useMemo(() => {
    return isQuestionDirty(question, originalQuestion);
  }, [question, originalQuestion]);

  const isRunnable = useMemo(() => {
    return isQuestionRunnable(question, isDirty);
  }, [question, isDirty]);

  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );

  return (
    question && (
      <ScrollArea w="100%" h="100%">
        <QBNotebook
          question={question}
          isDirty={isDirty}
          isRunnable={isRunnable}
          isResultDirty={isDirty}
          reportTimezone={reportTimezone}
          readOnly={false}
          updateQuestion={async (nextQuestion: Question) =>
            await updateQuestion(nextQuestion, { run: false })
          }
          runQuestionQuery={async () => {
            await runQuestion();
            onApply();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={true}
        />
      </ScrollArea>
    )
  );
};
