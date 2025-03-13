import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactElement } from "react";
import { t } from "ttag";

import {
  QuestionNotFoundError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { shouldRunCardQuery } from "embedding-sdk/lib/interactive-question";
import type { SdkQuestionTitleProps } from "embedding-sdk/types/question";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import {
  Box,
  Button,
  Divider,
  Group,
  PopoverBackButton,
  Stack,
} from "metabase/ui";

import { InteractiveQuestion } from "../../public/InteractiveQuestion";
import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../FlexibleSizeComponent";
import { shouldShowSaveButton } from "../InteractiveQuestion/components";
import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

import { DefaultViewTitle } from "./DefaultViewTitle";
import InteractiveQuestionS from "./InteractiveQuestionDefaultView.module.css";

export interface InteractiveQuestionDefaultViewProps {
  title?: SdkQuestionTitleProps;
  withResetButton?: boolean;
  withChartTypeSelector?: boolean;
}

export const InteractiveQuestionDefaultView = ({
  height,
  width,
  className,
  style,
  title,
  withResetButton,
  withChartTypeSelector,
}: InteractiveQuestionDefaultViewProps & FlexibleSizeProps): ReactElement => {
  const {
    originalId,
    question,
    queryResults,
    isQuestionLoading,
    originalQuestion,
    onCreate,
    onSave,
    isSaveEnabled,
    targetCollection,
    isCardIdError,
  } = useInteractiveQuestionContext();

  const isCreatingQuestionFromScratch =
    originalId === "new" && !question?.isSaved();

  const [isEditorOpen, { close: closeEditor, toggle: toggleEditor }] =
    useDisclosure(isCreatingQuestionFromScratch);

  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading =
    question && shouldRunCardQuery(question) && !queryResults;

  if (!isEditorOpen && (isQuestionLoading || isQueryResultLoading)) {
    return <SdkLoader />;
  }

  // `isCardError: true` when the entity ID couldn't be resolved
  if ((!question || isCardIdError) && originalId && originalId !== "new") {
    return <QuestionNotFoundError id={originalId} />;
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
      {queryResults && (
        <Stack className={InteractiveQuestionS.TopBar} gap="sm" p="md">
          <Group justify="space-between" align="flex-end">
            <Group gap="xs">
              <Box mr="sm">
                <InteractiveQuestion.BackButton />
              </Box>
              <DefaultViewTitle
                title={title}
                withResetButton={withResetButton}
              />
            </Group>
            {showSaveButton && (
              <InteractiveQuestion.SaveButton onClick={openSaveModal} />
            )}
          </Group>
          <Group
            justify="space-between"
            p="sm"
            bg="var(--mb-color-bg-sdk-question-toolbar)"
            style={{ borderRadius: "0.5rem" }}
            data-testid="interactive-question-result-toolbar"
          >
            <Group gap="xs">
              {isEditorOpen ? (
                <PopoverBackButton
                  onClick={toggleEditor}
                  color="brand"
                  fz="md"
                  ml="sm"
                >
                  {t`Back to visualization`}
                </PopoverBackButton>
              ) : (
                <>
                  {withChartTypeSelector && (
                    <>
                      <Button.Group>
                        <InteractiveQuestion.ChartTypeDropdown />
                        <InteractiveQuestion.QuestionSettingsDropdown />
                      </Button.Group>
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
                </>
              )}
            </Group>
            <InteractiveQuestion.EditorButton
              isOpen={isEditorOpen}
              onClick={toggleEditor}
            />
          </Group>
        </Stack>
      )}

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
          targetCollection={targetCollection}
        />
      )}
    </FlexibleSizeComponent>
  );
};
