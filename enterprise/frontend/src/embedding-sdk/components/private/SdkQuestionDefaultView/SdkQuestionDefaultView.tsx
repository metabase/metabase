import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { t } from "ttag";

import {
  QuestionNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import { shouldRunCardQuery } from "embedding-sdk/lib/sdk-question";
import type { SdkQuestionTitleProps } from "embedding-sdk/types/question";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  Box,
  Button,
  Divider,
  Group,
  PopoverBackButton,
  Stack,
} from "metabase/ui";

import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../FlexibleSizeComponent";
import { shouldShowSaveButton } from "../SdkQuestion/components";
import { useSdkQuestionContext } from "../SdkQuestion/context";

import { DefaultViewTitle } from "./DefaultViewTitle";
import InteractiveQuestionS from "./SdkQuestionDefaultView.module.css";

export interface SdkQuestionDefaultViewProps extends FlexibleSizeProps {
  /**
   * Determines whether the question title is displayed, and allows a custom title to be displayed instead of the default question title. Shown by default. Only applicable to interactive questions when using the default layout.
   */
  title?: SdkQuestionTitleProps;

  /**
   * Determines whether a reset button is displayed. Only relevant when using the default layout.
   */
  withResetButton?: boolean;

  /**
   * Determines whether the chart type selector and corresponding settings button are shown. Only relevant when using the default layout.
   */
  withChartTypeSelector?: boolean;
}

export const SdkQuestionDefaultView = ({
  height,
  width,
  className,
  style,
  title,
  withResetButton,
  withChartTypeSelector,
}: SdkQuestionDefaultViewProps): ReactElement => {
  const { isLocaleLoading } = useLocale();
  const {
    originalId,
    question,
    queryResults,
    isQuestionLoading,
    originalQuestion,
    isSaveEnabled,
    withDownloads,
  } = useSdkQuestionContext();

  const isNewQuestion = originalId === "new";
  const isQuestionSaved = question?.isSaved();

  const [
    isEditorOpen,
    { close: closeEditor, toggle: toggleEditor, open: openEditor },
  ] = useDisclosure(isNewQuestion && !isQuestionSaved);

  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  useEffect(() => {
    if (isNewQuestion && !isQuestionSaved) {
      // When switching to new question, open the notebook editor
      openEditor();
    } else if (!isNewQuestion) {
      // When no longer in a notebook editor, switch back to visualization.
      // When a question is saved, also switch back to visualization.
      closeEditor();
    }
  }, [isNewQuestion, isQuestionSaved, openEditor, closeEditor]);

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading =
    question && shouldRunCardQuery(question) && !queryResults;

  if (
    !isEditorOpen &&
    (isLocaleLoading || isQuestionLoading || isQueryResultLoading)
  ) {
    return <SdkLoader />;
  }

  if (!isEditorOpen && !question) {
    if (originalId) {
      return <QuestionNotFoundError id={originalId} />;
    } else {
      return <SdkError message={t`Question not found`} />;
    }
  }

  const showSaveButton =
    shouldShowSaveButton({ question, originalQuestion }) && isSaveEnabled;

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={cx(InteractiveQuestionS.Container, className)}
      style={style}
    >
      <Stack className={InteractiveQuestionS.TopBar} gap="sm" p="md">
        <Group justify="space-between" align="flex-end">
          <Group gap="xs">
            <Box mr="sm">
              <SdkQuestion.BackButton />
            </Box>
            <DefaultViewTitle title={title} withResetButton={withResetButton} />
          </Group>
          {showSaveButton && <SdkQuestion.SaveButton onClick={openSaveModal} />}
        </Group>
        {queryResults && (
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
                        <SdkQuestion.ChartTypeDropdown />
                        <SdkQuestion.QuestionSettingsDropdown />
                      </Button.Group>
                      <Divider
                        mx="xs"
                        orientation="vertical"
                        // we have to do this for now because Mantine's divider overrides this color no matter what
                        color="var(--mb-color-border) !important"
                      />
                    </>
                  )}
                  <SdkQuestion.FilterDropdown />
                  <SdkQuestion.SummarizeDropdown />
                  <SdkQuestion.BreakoutDropdown />
                </>
              )}
            </Group>
            <Group gap="sm">
              {withDownloads && <SdkQuestion.DownloadWidgetDropdown />}
              <SdkQuestion.EditorButton
                isOpen={isEditorOpen}
                onClick={toggleEditor}
              />
            </Group>
          </Group>
        )}
      </Stack>

      <Box className={InteractiveQuestionS.Main} p="sm" w="100%" h="100%">
        <Box className={InteractiveQuestionS.Content}>
          {isEditorOpen ? (
            <SdkQuestion.Editor onApply={closeEditor} />
          ) : (
            <SdkQuestion.QuestionVisualization height="100%" />
          )}
        </Box>
      </Box>
      {/* Refer to the SaveQuestionProvider for context on why we have to do it like this */}
      <DefaultViewSaveModal isOpen={isSaveModalOpen} close={closeSaveModal} />
    </FlexibleSizeComponent>
  );
};

const DefaultViewSaveModal = ({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) => {
  const {
    question,
    originalQuestion,
    onCreate,
    onSave,
    isSaveEnabled,
    targetCollection,
  } = useSdkQuestionContext();

  const { id, isLoading } = useTranslatedCollectionId({
    id: targetCollection,
  });

  if (!isSaveEnabled || !isOpen || !question || isLoading) {
    return null;
  }

  return (
    <SaveQuestionModal
      question={question}
      originalQuestion={originalQuestion ?? null}
      opened
      closeOnSuccess
      onClose={close}
      onCreate={onCreate}
      onSave={async (question) => {
        await onSave(question);
        close();
      }}
      targetCollection={id}
    />
  );
};
