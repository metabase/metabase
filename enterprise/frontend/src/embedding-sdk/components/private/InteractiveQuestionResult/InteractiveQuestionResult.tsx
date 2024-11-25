import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { Box, Divider, Group, Stack, Text } from "metabase/ui";

import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "../../public/FlexibleSizeComponent";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";
import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

import InteractiveQuestionS from "./InteractiveQuestionResult.module.css";
import { getQuestionTitle } from "../QuestionTitle";

export interface InteractiveQuestionResultProps {
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
}

export const InteractiveQuestionResult = ({
  height,
  width,
  className,
  style,
  withTitle,
  customTitle,
  withResetButton,
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

  const ResultTitle = () => {
    if (!withTitle) {
      return null;
    }

    const T = ({ text }: { text: any }) => (
      <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
        {text}
      </Text>
    );

    if (!customTitle && question) {
      const questionTitle = getQuestionTitle({ question });
      return <T text={questionTitle} />;
    }

    if (isValidElement(customTitle)) {
      return customTitle;
    }

    return <T text={customTitle} />;
  };

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={cx(InteractiveQuestionS.Container, className)}
      style={style}
    >
      <Stack className={InteractiveQuestionS.TopBar} spacing="sm" p="md">
        <Group position="apart">
          <Group spacing="xs">
            <InteractiveQuestion.BackButton />
            <ResultTitle />
          </Group>
          {isSaveEnabled && !isSaveModalOpen && (
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
            <InteractiveQuestion.ChartTypeDropdown />
            <Divider
              mx="xs"
              orientation="vertical"
              // we have to do this for now because Mantine's divider overrides this color no matter what
              color="var(--mb-color-border) !important"
            />
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
          {match<boolean>(isEditorOpen)
            .with(true, () => (
              <InteractiveQuestion.Editor onApply={closeEditor} />
            ))
            .with(false, () => (
              <InteractiveQuestion.QuestionVisualization height="100%" />
            ))
            .exhaustive()}
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
