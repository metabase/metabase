import cx from "classnames";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  BackButton,
  FilterBar,
  QuestionResetButton,
  Title,
  Filter,
  FilterButton,
  Summarize,
  SummarizeButton,
  Notebook,
  NotebookButton,
  QuestionVisualization,
} from "embedding-sdk/components/public/InteractiveQuestion/components";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Group, Stack } from "metabase/ui";

import { useInteractiveQuestionData } from "../public/InteractiveQuestion/hooks";

interface InteractiveQuestionResultProps {
  height?: string | number;
  withResetButton?: boolean;
  withTitle: boolean;
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
    return (
      <Stack>
        <Button onClick={returnToVisualization}>{t`Close`}</Button>
        <Filter onClose={returnToVisualization} />
      </Stack>
    );
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

  const { isQuestionLoading } = useInteractiveQuestionContext();

  const { defaultHeight, isQueryRunning, queryResults, question } =
    useInteractiveQuestionData();

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Stack h="100%">
        <Flex direction="row" gap="md" px="md" align="center">
          <BackButton />
          {withTitle && (customTitle ?? <Title />)}
          {withResetButton && <QuestionResetButton />}
          <FilterButton onClick={() => setQuestionView("filter")} />
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

        <Group h="100%" pos="relative" align="flex-start">
          <ResultView
            questionView={questionView}
            setQuestionView={setQuestionView}
          />
        </Group>
      </Stack>
    </Box>
  );
};
