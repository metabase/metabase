import cx from "classnames";
import { type ReactElement, type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Group, Icon, Popover, Stack } from "metabase/ui";

import { InteractiveQuestion } from "../public/InteractiveQuestion";

import { useInteractiveQuestionContext } from "./InteractiveQuestion/context";

export interface InteractiveQuestionResultProps {
  height?: string | number;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
}

type QuestionView = "notebook" | "filter" | "summarize" | "visualization";

const VisualizationResultView = () => {
  return (
    <Stack h="100%">
      <Group m="sm">
        <Popover position="bottom-start">
          <Popover.Target>
            <Button
              compact={true}
              radius="xl"
              py="sm"
              px="md"
              variant="filled"
              color="brand"
            >
              <Icon name="eye" />
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <InteractiveQuestion.ChartTypeSelector onChange={} />
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Group noWrap h="100%">
        <InteractiveQuestion.QuestionVisualization />
      </Group>
    </Stack>
  );
};

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

  return <VisualizationResultView />;
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
          <InteractiveQuestion.BackButton />
          {withTitle && (customTitle ?? <InteractiveQuestion.Title />)}
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

        <InteractiveQuestion.FilterBar />

        <Box
          h="100%"
          // pos="relative"
          // align="flex-start"
          // className={CS.overflowHidden}
          w="100%"
        >
          <ResultView
            questionView={questionView}
            setQuestionView={setQuestionView}
          />
        </Box>
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
