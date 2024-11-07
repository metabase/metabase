import { useState } from "react";

import type { DataPickerValue } from "metabase/common/components/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { Box, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { NotebookFooter } from "../NotebookFooter";
import { NotebookStepList } from "../NotebookStepList";

import { NotebookProvider } from "./context";

export type NotebookProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  reportTimezone: string;
  hasVisualizeButton?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
  readOnly?: boolean;
  modelsFilterList?: DataPickerValue["model"][];
};

export const Notebook = ({
  updateQuestion,
  reportTimezone,
  readOnly,
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  runQuestionQuery,
  modelsFilterList,
}: NotebookProps) => {
  const dispatch = useDispatch();
  const [liveUpdate, setLiveUpdate] = useState(false);

  const handleUpdateQuestion = async (question: Question): Promise<void> => {
    dispatch(setUIControls({ isModifiedFromNotebook: true }));
    await updateQuestion(question);
    if (liveUpdate) {
      await runQuestionQuery();
    }
  };

  const handleLiveUpdateChange = (liveUpdate: boolean) => {
    setLiveUpdate(liveUpdate);
    if (liveUpdate) {
      runQuestionQuery();
    }
  };

  return (
    <NotebookProvider modelsFilterList={modelsFilterList}>
      <Flex direction="column">
        <Box pos="relative" w="100%" p={{ base: "1rem", sm: "2rem" }}>
          <NotebookStepList
            updateQuestion={handleUpdateQuestion}
            question={question}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
          />
        </Box>
        <NotebookFooter
          liveUpdate={liveUpdate}
          onLiveUpdateChange={handleLiveUpdateChange}
          question={question}
          runQuestionQuery={runQuestionQuery}
          isRunnable={isRunnable}
          isResultDirty={isResultDirty}
          isDirty={isDirty}
        />
      </Flex>
    </NotebookProvider>
  );
};
