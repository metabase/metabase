import cx from "classnames";
import { type ReactElement, type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Stack } from "metabase/ui";

import { InteractiveQuestion } from "../public/InteractiveQuestion";

import { useInteractiveQuestionContext } from "./InteractiveQuestion/context";

export interface InteractiveQuestionResultProps {
  height?: string | number;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
}

type QuestionView = "notebook" | "filter" | "summarize" | "visualization";

const ResultView = ({
  questionView,
  setQuestionView,
}: {
  questionView: QuestionView;
  setQuestionView: (questionView: QuestionView) => void;
}) => {
  const returnToVisualization = () => {
    setQuestionView("visualization");
  };

  if (questionView === "filter") {
    return <InteractiveQuestion.Filter onClose={returnToVisualization} />;
  }

  if (questionView === "summarize") {
    return <InteractiveQuestion.Summarize onClose={returnToVisualization} />;
  }

  if (questionView === "notebook") {
    return <InteractiveQuestion.Notebook onApply={returnToVisualization} />;
  }

  return <InteractiveQuestion.QuestionVisualization />;
};

export const InteractiveQuestionResult = ({
  height,
  withTitle,
  customTitle,
  withResetButton,
}: InteractiveQuestionResultProps): ReactElement => {
  const [questionView, setQuestionView] =
    useState<QuestionView>("visualization");

  const { question, queryResults, isQuestionLoading } =
    useInteractiveQuestionContext();

  let content;

  if (isQuestionLoading) {
    content = <SdkLoader />;
  } else if (!question || !queryResults) {
    content = <SdkError message={t`Question not found`} />;
  } else {
    content = (
      <Stack h="100%">
        <Flex
          direction="row"
          gap="md"
          px="md"
          align="center"
          data-testid="qb-header-action-panel"
        >
          xxxxxxxxxxx
          <InteractiveQuestion.BackButton />
          yyyyyyyyyyy
          {withTitle && (customTitle ?? <InteractiveQuestion.Title />)}
          <Flex direction="row" data-testid="action-buttons">
            {withResetButton && <InteractiveQuestion.ResetButton />}
            <InteractiveQuestion.FilterButton
              onClick={() =>
                setQuestionView(
                  questionView === "filter" ? "visualization" : "filter",
                )
              }
            />
            <InteractiveQuestion.SummarizeButton
              isOpen={questionView === "summarize"}
              onOpen={() => setQuestionView("summarize")}
              onClose={() => setQuestionView("visualization")}
            />
            <InteractiveQuestion.NotebookButton
              isOpen={questionView === "notebook"}
              onClick={() =>
                setQuestionView(
                  questionView === "notebook" ? "visualization" : "notebook",
                )
              }
            />
          </Flex>
        </Flex>
        <InteractiveQuestion.FilterBar />
        <Group
          h="100%"
          pos="relative"
          align="flex-start"
          className={CS.overflowHidden}
        >
          <ResultView
            questionView={questionView}
            setQuestionView={setQuestionView}
          />
        </Group>
      </Stack>
    );
  }

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? "100%"}
      bg="var(--mb-color-bg-question)"
    >
      {content}
    </Box>
  );
};
