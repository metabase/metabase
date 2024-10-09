import { useDisclosure } from "@mantine/hooks";
import { type ReactElement, type ReactNode, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { Box, Button, Group, Icon } from "metabase/ui";

import { InteractiveQuestion } from "../../public/InteractiveQuestion";
import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

import InteractiveQuestionS from "./InteractiveQuestionResult.module.css";

export interface InteractiveQuestionResultProps {
  height?: string | number;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
}

type QuestionView = "notebook" | "filter" | "summarize" | "visualization";

const ContentView = ({
  questionView,
  onReturn,
}: {
  questionView: QuestionView;
  onReturn: () => void;
}) =>
  match<QuestionView>(questionView)
    .with("filter", () => <InteractiveQuestion.Filter onClose={onReturn} />)
    .with("summarize", () => (
      <InteractiveQuestion.Summarize onClose={onReturn} />
    ))
    .with("notebook", () => <InteractiveQuestion.Notebook onApply={onReturn} />)
    .otherwise(() => <InteractiveQuestion.QuestionVisualization />);

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

  const [isChartSelectorOpen, { toggle: toggleChartTypeSelector }] =
    useDisclosure(true);

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <Box
      h={height ?? "100%"}
      w="100%"
      className={InteractiveQuestionS.Container}
    >
      <Group className={InteractiveQuestionS.TopBar} position="apart" p="md">
        {withTitle && (customTitle ?? <InteractiveQuestion.Title />)}
        <Group spacing="xs">
          {withResetButton && <InteractiveQuestion.ResetButton />}
          <InteractiveQuestion.FilterButton
            onClick={() =>
              setQuestionView(
                questionView === "filter" ? "visualization" : "filter",
              )
            }
          />
          <InteractiveQuestion.SummarizeButton
            onOpen={() => setQuestionView("summarize")}
            onClose={() => setQuestionView("visualization")}
            isOpen={questionView === "summarize"}
          />
          <InteractiveQuestion.NotebookButton
            isOpen={questionView === "notebook"}
            onClick={() =>
              setQuestionView(
                questionView === "notebook" ? "visualization" : "notebook",
              )
            }
          />
        </Group>
      </Group>

      <Group className={InteractiveQuestionS.MidBar} py={0} px="md">
        {questionView === "visualization" && (
          <Button
            compact={true}
            radius="xl"
            py="sm"
            px="md"
            variant="filled"
            color="brand"
            onClick={toggleChartTypeSelector}
          >
            <Group>
              <Icon
                name={
                  questionView === "visualization"
                    ? "arrow_left"
                    : "arrow_right"
                }
              />
              <Icon name="eye" />
            </Group>
          </Button>
        )}
        <Box style={{ flex: 1 }}>
          <InteractiveQuestion.FilterBar />
        </Box>
      </Group>
      <Box className={InteractiveQuestionS.Main} p="md" w="100%" h="100%">
        <Box className={InteractiveQuestionS.ChartTypeSelector}>
          {isChartSelectorOpen && questionView === "visualization" ? (
            <InteractiveQuestion.ChartTypeSelector />
          ) : null}
        </Box>
        <Box className={InteractiveQuestionS.Content}>
          <ContentView
            questionView={questionView}
            onReturn={() => setQuestionView("visualization")}
          />
        </Box>
      </Box>
    </Box>
  );
};
