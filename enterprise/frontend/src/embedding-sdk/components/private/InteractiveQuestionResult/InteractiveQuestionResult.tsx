import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactElement } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkQuestionTitleProps } from "embedding-sdk/types/question";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { Box, Divider, Group, Stack } from "metabase/ui";

import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../../public/FlexibleSizeComponent";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";
import { shouldShowSaveButton } from "../InteractiveQuestion/components";
import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

import InteractiveQuestionS from "./InteractiveQuestionResult.module.css";
import { ResultTitle } from "./ResultTitle";

export interface InteractiveQuestionResultProps {
  title?: SdkQuestionTitleProps;
  withResetButton?: boolean;
  withChartTypeSelector?: boolean;
}

export const InteractiveQuestionResult = ({
  height,
  width,
  className,
  style,
  title,
  withResetButton,
  withChartTypeSelector,
}: InteractiveQuestionResultProps & FlexibleSizeProps): ReactElement => {
  const [isEditorOpen, { close: closeEditor, toggle: toggleEditor }] =
    useDisclosure(false);

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

  const showSaveButton =
    shouldShowSaveButton({ question, originalQuestion }) &&
    isSaveEnabled &&
    !isSaveModalOpen;

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={cx(InteractiveQuestionS.Container, className)}
      style={style}
    >
      <Stack className={InteractiveQuestionS.TopBar} spacing="sm" p="md">
        <Group position="apart" align="flex-end">
          <Group spacing="xs">
            <InteractiveQuestion.BackButton />
            <ResultTitle title={title} withResetButton={withResetButton} />
          </Group>
          {showSaveButton && (
            <InteractiveQuestion.SaveButton onClick={openSaveModal} />
          )}
        </Group>
        <Group
          position="apart"
          p="sm"
          bg="var(--mb-color-background-disabled)"
          style={{ borderRadius: "0.5rem" }}
        >
          <Group spacing="xs">
            {withChartTypeSelector && (
              <>
                <InteractiveQuestion.ChartTypeDropdown />
                <Divider
                  mx="xs"
                  orientation="vertical"
                  // we have to do this for now because Mantine's divider overrides this color no matter what
                  color="var(--mb-color-border) !important"
                />
              </>
            )}
            <InteractiveQuestion.FilterDropdown />
            <InteractiveQuestion.SummarizeDropdown />
            <InteractiveQuestion.BreakoutDropdown />
          </Group>
          <InteractiveQuestion.EditorButton
            isOpen={isEditorOpen}
            onClick={toggleEditor}
          />
        </Group>
      </Stack>

      <Box className={InteractiveQuestionS.Main} p="sm" w="100%" h="100%">
        <Box className={InteractiveQuestionS.Content}>
          {isEditorOpen ? (
            <InteractiveQuestion.Editor onApply={closeEditor} />
          ) : (
            <InteractiveQuestion.QuestionVisualization height="100%" />
          )}
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
          onSave={async question => {
            await onSave(question);
            closeSaveModal();
          }}
          saveToCollectionId={saveToCollectionId}
        />
      )}
    </FlexibleSizeComponent>
  );
};
