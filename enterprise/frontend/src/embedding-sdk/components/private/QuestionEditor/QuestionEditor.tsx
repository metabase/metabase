import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Box, Group, Tabs } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

export type QuestionEditorProps = {
  isSaveEnabled?: boolean;
};

const QuestionEditorInner = ({ isSaveEnabled }: QuestionEditorProps) => {
  const { queryResults, runQuestion, question, originalQuestion } =
    useInteractiveQuestionContext();

  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | (string & unknown) | null
  >("notebook");
  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

  const onOpenVisualizationTab = async () => {
    setActiveTab("visualization");
    await runQuestion();
  };

  return (
    <Box w="100%" h="100%">
      <Tabs
        value={activeTab}
        onTabChange={setActiveTab}
        defaultValue="notebook"
      >
        <Group position="apart">
          <Group>
            <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
            {queryResults ? (
              <Tabs.Tab value="visualization" onClick={onOpenVisualizationTab}>
                Visualization
              </Tabs.Tab>
            ) : null}
          </Group>
          {!isSaveModalOpen && (
            <Group>
              <InteractiveQuestion.ResetButton
                onClick={() => {
                  setActiveTab("notebook");
                  closeSaveModal();
                }}
              />
              {isSaveEnabled && (
                <InteractiveQuestion.SaveButton onClick={openSaveModal} />
              )}
            </Group>
          )}
        </Group>

        <Tabs.Panel value="notebook">
          <InteractiveQuestion.Notebook
            onApply={() => setActiveTab("visualization")}
          />
        </Tabs.Panel>

        <Tabs.Panel value="visualization">
          <InteractiveQuestion.QuestionVisualization />
        </Tabs.Panel>
      </Tabs>

      {/* Refer to the SaveQuestionProvider for context on why we have to do it like this */}
      {isSaveModalOpen && question && (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion ?? null}
          opened={true}
          onClose={closeSaveModal}
          onCreate={handleCreate}
          onSave={handleSave}
        />
      )}
    </Box>
  );
};

export const QuestionEditor = ({
  questionId,
  isSaveEnabled = true,
  plugins,
}: InteractiveQuestionProps & QuestionEditorProps) => (
  <InteractiveQuestion questionId={questionId} plugins={plugins}>
    <QuestionEditorInner isSaveEnabled={isSaveEnabled} />
  </InteractiveQuestion>
);
