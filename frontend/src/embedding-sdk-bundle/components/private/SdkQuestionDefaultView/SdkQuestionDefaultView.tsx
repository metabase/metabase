import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import {
  QuestionNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { QuestionVisualization } from "embedding-sdk-bundle/components/private/SdkQuestion/components/Visualization";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { useCollectionData } from "embedding-sdk-bundle/hooks/private/use-collection-data";
import { useQuestionEditorSync } from "embedding-sdk-bundle/hooks/private/use-question-editor-sync";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { shouldRunCardQuery } from "embedding-sdk-bundle/lib/sdk-question";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { SdkQuestionTitleProps } from "embedding-sdk-bundle/types/question";
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
import * as Lib from "metabase-lib";

import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../FlexibleSizeComponent";
import { BreakoutDropdown } from "../SdkQuestion/components/Breakout/BreakoutDropdown";
import { ChartTypeDropdown } from "../SdkQuestion/components/ChartTypeDropdown";
import { DownloadWidgetDropdown } from "../SdkQuestion/components/DownloadWidget";
import { Editor } from "../SdkQuestion/components/Editor";
import { EditorButton } from "../SdkQuestion/components/EditorButton/EditorButton";
import { FilterDropdown } from "../SdkQuestion/components/Filter/FilterDropdown";
import { QuestionSettingsDropdown } from "../SdkQuestion/components/QuestionSettings";
import { ResultToolbar } from "../SdkQuestion/components/ResultToolbar/ResultToolbar";
import {
  SaveButton,
  shouldShowSaveButton,
} from "../SdkQuestion/components/SaveButton";
import { SummarizeDropdown } from "../SdkQuestion/components/Summarize/SummarizeDropdown";
import { useSdkQuestionContext } from "../SdkQuestion/context";

import { DefaultViewTitle } from "./DefaultViewTitle";
import InteractiveQuestionS from "./SdkQuestionDefaultView.module.css";

export interface SdkQuestionDefaultViewProps extends FlexibleSizeProps {
  /**
   * Determines whether the question title is displayed, and allows a custom title to be displayed instead of the default question title. Shown by default.
   */
  title?: SdkQuestionTitleProps;

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
    targetCollection,
    onReset,
    onNavigateBack,
    queryQuestion,
  } = useSdkQuestionContext();

  const { reportLocation } = useSdkBreadcrumbs();
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  const isQuestionSaved = question?.isSaved();

  const { isEditorOpen, closeEditor, toggleEditor } = useQuestionEditorSync({
    originalId,
    isQuestionSaved,
    queryResults,
    queryQuestion,
  });

  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  const isNativeQuestion = useMemo(() => {
    if (!question) {
      return false;
    }

    const { isNative } = Lib.queryDisplayInfo(question.query());

    return isNative;
  }, [question]);

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading =
    question && shouldRunCardQuery({ question, isGuestEmbed }) && !queryResults;

  useEffect(() => {
    const isNewQuestion = originalId === "new" || originalId === "new-native";
    const isExistingQuestion =
      question &&
      !isQuestionLoading &&
      question?.isSaved() &&
      !isNewQuestion &&
      queryResults;

    const onNavigate = onNavigateBack ?? onReset ?? undefined;

    if (isNewQuestion) {
      reportLocation({
        type: "question",
        id: originalId,
        name: "New exploration",
        onNavigate,
      });
    } else if (isExistingQuestion) {
      reportLocation({
        type: "question",
        id: question.id(),
        name: question.displayName() || "Question",
        onNavigate,
      });
    }
  }, [
    isQuestionLoading,
    question,
    originalId,
    queryResults,
    reportLocation,
    onNavigateBack,
    onReset,
  ]);

  const { canWrite: canWriteToTargetCollection } = useCollectionData(
    targetCollection,
    { skipCollectionFetching: !isSaveEnabled },
  );

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
    shouldShowSaveButton({
      question,
      originalQuestion,
      canWriteToTargetCollection,
    }) && isSaveEnabled;

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={cx(InteractiveQuestionS.Container, className)}
      style={style}
    >
      <Stack className={InteractiveQuestionS.TopBar} gap="sm" py="md" pr="md">
        <Group
          justify="space-between"
          align="flex-end"
          data-testid="interactive-question-top-toolbar"
        >
          <Group gap="xs">
            <DefaultViewTitle title={title} />
          </Group>
          {showSaveButton && <SaveButton onClick={openSaveModal} />}
        </Group>
        {queryResults && (
          <ResultToolbar data-testid="interactive-question-result-toolbar">
            <Group gap="xs">
              {isEditorOpen ? (
                <PopoverBackButton
                  onClick={toggleEditor}
                  c="brand"
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
                        <ChartTypeDropdown />
                        <QuestionSettingsDropdown />
                      </Button.Group>

                      {!isNativeQuestion && (
                        <Divider
                          mx="xs"
                          orientation="vertical"
                          style={{
                            color: "var(--mb-color-border) !important",
                          }}
                        />
                      )}
                    </>
                  )}

                  {!isNativeQuestion && (
                    <>
                      <FilterDropdown />
                      <SummarizeDropdown />
                      <BreakoutDropdown />
                    </>
                  )}
                </>
              )}
            </Group>
            <Group gap="sm">
              {withDownloads && <DownloadWidgetDropdown />}
              <EditorButton isOpen={isEditorOpen} onClick={toggleEditor} />
            </Group>
          </ResultToolbar>
        )}

        {isGuestEmbed && (
          <Box w="100%">
            <SdkQuestion.SqlParametersList />
          </Box>
        )}
      </Stack>

      <Box
        className={cx(InteractiveQuestionS.Main, "sdk-question-main")}
        p="sm"
        w="100%"
        h="100%"
      >
        <Box className={InteractiveQuestionS.Content}>
          {isEditorOpen ? (
            <Editor onApply={closeEditor} />
          ) : (
            <QuestionVisualization height="100%" />
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

  if (!isSaveEnabled || !isOpen || !question) {
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
      targetCollection={targetCollection}
    />
  );
};
