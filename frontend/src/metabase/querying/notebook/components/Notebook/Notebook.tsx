import { t } from "ttag";

import type { DataPickerValue } from "metabase/common/components/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { Button, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
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
  setQueryBuilderMode?: (mode: string) => void;
  readOnly?: boolean;
  modelsFilterList?: DataPickerValue["model"][];
  minNotebookWidth?: number;
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
  minNotebookWidth,
}: NotebookProps) => {
  const dispatch = useDispatch();

  async function cleanupQuestion() {
    // Converting a query to MLv2 and back performs a clean-up
    let cleanQuestion = question.setQuery(
      Lib.dropEmptyStages(question.query()),
    );

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
    await setQueryBuilderMode?.("view");
    if (isResultDirty) {
      await runQuestionQuery();
    }
  }

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
          style={{ overflowY: "auto" }}
        >
          <NotebookStepList
            updateQuestion={handleUpdateQuestion}
            question={question}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
          />
        </Flex>
        {hasVisualizeButton && isRunnable && (
          <Flex
            p="sm"
            style={{
              borderTop:
                "var(--border-size) var(--border-style) var(--mb-color-border)",
            }}
          >
            <Button variant="filled" miw={220} onClick={visualize}>
              {t`Visualize`}
            </Button>
          </Flex>
        )}
      </Flex>
    </NotebookProvider>
  );
};
