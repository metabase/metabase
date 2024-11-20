import type { DataPickerValue } from "metabase/common/components/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

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
  setQueryBuilderMode?: (mode: string) => Promise<void>;
  readOnly?: boolean;
  modelsFilterList?: DataPickerValue["model"][];
  minNotebookWidth?: number;
};

export const Notebook = ({
  updateQuestion,
  reportTimezone,
  readOnly,
  question,
  modelsFilterList,
  minNotebookWidth,
}: NotebookProps) => {
  const dispatch = useDispatch();

  const handleUpdateQuestion = (question: Question): Promise<void> => {
    dispatch(setUIControls({ isModifiedFromNotebook: true }));
    return updateQuestion(question);
  };

  return (
    <NotebookProvider modelsFilterList={modelsFilterList}>
      <Flex
        miw={{ lg: minNotebookWidth }}
        direction="column"
        style={{ flex: 1 }}
      >
        <Flex
          pos="relative"
          p={{ base: "1rem", sm: "2rem" }}
          direction="column"
          style={{ overflowY: "auto", flex: 1 }}
        >
          <NotebookStepList
            updateQuestion={handleUpdateQuestion}
            question={question}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
          />
        </Flex>
      </Flex>
    </NotebookProvider>
  );
};
