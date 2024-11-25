import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactElement, type ReactNode, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { Box, Button, Group, Icon } from "metabase/ui";

import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../../public/FlexibleSizeComponent";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";
import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

import InteractiveQuestionS from "./InteractiveQuestionResult.module.css";

export interface InteractiveQuestionResultProps {
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
}

type QuestionView = "editor" | "filter" | "summarize" | "visualization";

const ContentView = ({
  questionView,
  onReturnToVisualization,
}: {
  questionView: QuestionView;
  onReturnToVisualization: () => void;
}) =>
  match<QuestionView>(questionView)
    .with("filter", () => (
      <InteractiveQuestion.Filter onClose={onReturnToVisualization} />
    ))
    .with("summarize", () => (
      <InteractiveQuestion.Summarize onClose={onReturnToVisualization} />
    ))
    .with("editor", () => (
      <InteractiveQuestion.Editor onApply={onReturnToVisualization} />
    ))
    .otherwise(() => (
      <InteractiveQuestion.QuestionVisualization height="100%" />
    ));

export const InteractiveQuestionResult = ({
  height,
  width,
  className,
  style,
  withTitle,
  customTitle,
  withResetButton,
}: InteractiveQuestionResultProps & FlexibleSizeProps): ReactElement => {
  const [questionView, setQuestionView] =
    useState<QuestionView>("visualization");

  const {
    question,
    queryResults,
    isQuestionLoading,
    originalQuestion,
    onCreate,
    onSave,
    isSaveEnabled,
    saveToCollectionId,
  } = useInteractiveQuestionContext();

  const [isChartSelectorOpen, { toggle: toggleChartTypeSelector }] =
    useDisclosure(false);

  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading = question && !queryResults;

  if (isQuestionLoading || isQueryResultLoading) {
    return <SdkLoader />;
  }

  if (!question) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={cx(InteractiveQuestionS.Container, className)}
      style={style}
    >
      <Group className={InteractiveQuestionS.TopBar} position="apart" p="md">
        <InteractiveQuestion.BackButton />
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
          <InteractiveQuestion.EditorButton
            isOpen={questionView === "editor"}
            onClick={() =>
              setQuestionView(
                questionView === "editor" ? "visualization" : "editor",
              )
            }
          />

          {isSaveEnabled && !isSaveModalOpen && (
            <InteractiveQuestion.SaveButton onClick={openSaveModal} />
          )}
        </Group>
      </Group>

      <Group className={InteractiveQuestionS.MidBar} py={0} px="md">
        {questionView === "visualization" && (
          <Button
            compact
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
            onReturnToVisualization={() => setQuestionView("visualization")}
          />
        </Box>
      </Box>

      {/* Refer to the SaveQuestionProvider for context on why we have to do it like this */}
      {isSaveEnabled && isSaveModalOpen && question && (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion ?? null}
          opened
          closeOnSuccess
          onClose={closeSaveModal}
          onCreate={onCreate}
          onSave={onSave}
          saveToCollectionId={saveToCollectionId}
        />
      )}
    </FlexibleSizeComponent>
  );
};
