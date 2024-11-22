import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import {
  getFirstQueryResult,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Group, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ViewFooterRoot } from "../ViewFooter.styled";

import { ConvertToNativeQuestionButton } from "./ConvertToNativeQuestionButton";
import { LeftViewFooterButtonGroup } from "./LeftViewFooterButtonGroup";
import { RightViewFooterButtonGroup } from "./RightViewFooterButtonGroup";

type ViewFooterProps = {
  className?: string;
  isResultDirty: boolean;
  setQueryBuilderMode?: (mode: string) => void;
  isDirty: boolean;
  runQuestionQuery: () => Promise<void>;
  hasVisualizeButton?: boolean;
  isNotebook: boolean;
  updateQuestion: (question: Question) => Promise<void>;
};

export const ViewFooter = ({
  className,
  isResultDirty,
  setQueryBuilderMode,
  isDirty,
  runQuestionQuery,
  updateQuestion,
  isNotebook,
  hasVisualizeButton = true,
}: ViewFooterProps) => {
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);
  const shouldHideFooterForNativeQuestionWithoutResult = !isNotebook && !result;

  const { isShowingNotebookNativePreview } = useSelector(getUiControls);
  if (!question || shouldHideFooterForNativeQuestionWithoutResult) {
    return null;
  }

  async function cleanupQuestion() {
    // Converting a query to MLv2 and back performs a clean-up
    let cleanQuestion = question?.setQuery(
      Lib.dropEmptyStages(question?.query()),
    );

    if (cleanQuestion?.display() === "table") {
      cleanQuestion = cleanQuestion.setDefaultDisplay();
    }

    if (cleanQuestion) {
      await updateQuestion(cleanQuestion);
    }
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

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hideChartSettings =
    (result?.error && !isEditable) || question.isArchived();

  return (
    <ViewFooterRoot
      className={cx(className, CS.textMedium, CS.borderTop, CS.fullWidth)}
      data-testid="view-footer"
    >
      <Group position="apart" pos="relative" noWrap w="100%">
        {isNotebook && hasVisualizeButton && isResultDirty ? (
          <Button
            variant="filled"
            radius="xl"
            pt={rem(7)}
            pb={rem(7)}
            miw={190}
            onClick={visualize}
          >
            {t`Visualize`}
          </Button>
        ) : (
          <LeftViewFooterButtonGroup
            question={question}
            hideChartSettings={hideChartSettings}
            isNotebook={isNotebook}
          />
        )}
        {isNotebook ? (
          isShowingNotebookNativePreview ? (
            <ConvertToNativeQuestionButton />
          ) : null
        ) : (
          <RightViewFooterButtonGroup />
        )}
      </Group>
    </ViewFooterRoot>
  );
};
