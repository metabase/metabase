import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";
import { useDispatch } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import type { NotebookDataPickerOptions } from "../../types";
import { NotebookStepList } from "../NotebookStepList";

import { VisualizeButton } from "./VisualizationButton";
import { type NotebookContextType, NotebookProvider } from "./context";

export type NotebookProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  reportTimezone: string;
  hasVisualizeButton?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery?: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
  readOnly?: boolean;
  modelsFilterList?: DataPickerValue["model"][];
  dataPickerOptions?: NotebookDataPickerOptions;
  filterStepComponent?: NotebookContextType["filterStepComponent"];
};

export const Notebook = ({
  updateQuestion,
  reportTimezone,
  readOnly,
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  hasVisualizeButton = true,
  runQuestionQuery,
  setQueryBuilderMode,
  modelsFilterList,
  dataPickerOptions,
  filterStepComponent,
}: NotebookProps) => {
  const dispatch = useDispatch();

  const handleUpdateQuestion = (question: Question): Promise<void> => {
    dispatch(setUIControls({ isModifiedFromNotebook: true }));
    return updateQuestion(question);
  };

  return (
    <NotebookProvider
      modelsFilterList={modelsFilterList}
      dataPickerOptions={dataPickerOptions}
      filterStepComponent={filterStepComponent}
    >
      <Box pos="relative" p={{ base: "1rem", sm: "2rem" }}>
        <NotebookStepList
          updateQuestion={handleUpdateQuestion}
          question={question}
          reportTimezone={reportTimezone}
          readOnly={readOnly}
        />
        {hasVisualizeButton && runQuestionQuery && (
          <VisualizeButton
            question={question}
            isDirty={isDirty}
            isRunnable={isRunnable}
            isResultDirty={isResultDirty}
            updateQuestion={updateQuestion}
            runQuestionQuery={runQuestionQuery}
            setQueryBuilderMode={setQueryBuilderMode}
          />
        )}
      </Box>
    </NotebookProvider>
  );
};
