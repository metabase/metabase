import { useMemo } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import { Notebook as QBNotebook } from "metabase/querying/notebook/components/Notebook";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

type EditorProps = { onApply?: () => void };

export const Editor = ({ onApply = () => {} }: EditorProps) => {
  // Loads databases and metadata so we can show notebook steps for the selected data source
  useDatabaseListQuery();

  const {
    question,
    originalQuestion,
    updateQuestion,
    runQuestion,
    modelsFilterList,
  } = useInteractiveQuestionContext();

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
          // the visualization button relies on this boolean
          isResultDirty={true}
          reportTimezone={reportTimezone}
          readOnly={false}
          updateQuestion={async (nextQuestion: Question) =>
            await updateQuestion(nextQuestion, { run: false })
          }
          runQuestionQuery={async () => {
            onApply();
            await runQuestion();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={true}
          modelsFilterList={modelsFilterList}
        />
      </ScrollArea>
    )
  );
};
