import cx from "classnames";
import { type ReactElement, type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Stack } from "metabase/ui";

import {
  BackButton,
  Filter,
  FilterBar,
  FilterButton,
  Notebook,
  NotebookButton,
  QuestionResetButton,
  QuestionVisualization,
  Summarize,
  SummarizeButton,
  Title,
} from "./InteractiveQuestion/components";
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
    return <Filter onClose={returnToVisualization} />;
  }

  if (questionView === "summarize") {
    return <Summarize onClose={returnToVisualization} />;
  }

  if (questionView === "notebook") {
    return <Notebook onApply={returnToVisualization} />;
  }

  return <QuestionVisualization />;
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
        <Flex direction="row" gap="md" px="md" align="center">
          <BackButton />
          {withTitle && (customTitle ?? <Title />)}
          {withResetButton && <QuestionResetButton />}
          <FilterButton
            onClick={() =>
              setQuestionView(
                questionView === "filter" ? "visualization" : "filter",
              )
            }
          />
          <SummarizeButton
            isOpen={questionView === "summarize"}
            onOpen={() => setQuestionView("summarize")}
            onClose={() => setQuestionView("visualization")}
          />
          <NotebookButton
            isOpen={questionView === "notebook"}
            onClick={() =>
              setQuestionView(
                questionView === "notebook" ? "visualization" : "notebook",
              )
            }
          />
        </Flex>

        <FilterBar />

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
      h={height}
      bg="var(--mb-color-bg-question)"
    >
      {content}
    </Box>
  );
};
