import { useState } from "react";

import { FlexibleSizeComponent } from "embedding-sdk";
import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { Button, Flex } from "metabase/ui";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

type CreateQuestionProps = Omit<
  InteractiveQuestionProps,
  "questionId" | "children"
>;

export const CreateQuestion = ({
  onSave,
  isSaveEnabled = true,
  ...props
}: CreateQuestionProps = {}) => {
  // The questionId is undefined at first.
  // Once the question is saved, we set the questionId to the saved question's id.
  const [questionId, setQuestionId] = useState<number | undefined>(undefined);

  const [isSaveModalOpen, setSaveModalOpen] = useState(false);

  return (
    <InteractiveQuestion
      {...props}
      questionId={questionId}
      isSaveEnabled={isSaveEnabled}
      onSave={question => {
        if (question) {
          setQuestionId(question.id());
          setSaveModalOpen(false);
          onSave?.(question);
        }
      }}
    >
      <CreateQuestionDefaultView
        isSaveModalOpen={isSaveModalOpen}
        setSaveModalOpen={setSaveModalOpen}
      />
    </InteractiveQuestion>
  );
};

export const CreateQuestionDefaultView = ({
  isSaveModalOpen,
  setSaveModalOpen,
}: {
  isSaveModalOpen: boolean;
  setSaveModalOpen: (isOpen: boolean) => void;
}) => {
  const [isVisualizationView, setIsVisualizationView] = useState(false);

  const { isSaveEnabled, question, originalQuestion, onSave, onCreate } =
    useInteractiveQuestionContext();

  return (
    <FlexibleSizeComponent>
      <Flex w="100%" justify="space-between" pb="lg">
        <Flex>
          <InteractiveQuestion.Title />
        </Flex>

        <Flex gap="sm">
          <Button onClick={() => setIsVisualizationView(!isVisualizationView)}>
            Show {isVisualizationView ? "editor" : "visualization"}
          </Button>

          <Button onClick={() => setSaveModalOpen(true)}>Save</Button>
        </Flex>
      </Flex>

      {isVisualizationView && (
        <Flex h="500px">
          <InteractiveQuestion.QuestionVisualization />
        </Flex>
      )}

      {!isVisualizationView && (
        <InteractiveQuestion.Editor
          onApply={() => setIsVisualizationView(true)}
        />
      )}

      {/* Refer to the SaveQuestionProvider for context on why we have to do it like this */}
      {isSaveEnabled && isSaveModalOpen && question && (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion ?? null}
          opened={true}
          closeOnSuccess={true}
          onClose={() => setSaveModalOpen(false)}
          onCreate={onCreate}
          onSave={onSave}
        />
      )}
    </FlexibleSizeComponent>
  );
};
