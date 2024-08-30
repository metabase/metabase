import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";
import { Box, Group, Overlay, Paper, Tabs } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

const QuestionEditorInner = () => {
  const { queryResults, runQuestion, enableSave } =
    useInteractiveQuestionContext();

  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | (string & unknown) | null
  >("notebook");
  const [isSaveFormOpen, { open: openSaveForm, close: closeSaveForm }] =
    useDisclosure(false);

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
          {!isSaveFormOpen && (
            <Group>
              <InteractiveQuestion.ResetButton
                onClick={() => {
                  setActiveTab("notebook");
                  closeSaveForm();
                }}
              />
              {enableSave && (
                <InteractiveQuestion.SaveButton onClick={openSaveForm} />
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

      {enableSave && isSaveFormOpen && (
        <Overlay center>
          <Paper>
            <InteractiveQuestion.SaveQuestionForm onClose={closeSaveForm} />
          </Paper>
        </Overlay>
      )}
    </Box>
  );
};

export const QuestionEditor = ({
  questionId,
  enableSave,
  plugins,
}: InteractiveQuestionProps) => (
  <InteractiveQuestion
    questionId={questionId}
    plugins={plugins}
    enableSave={enableSave}
  >
    <QuestionEditorInner />
  </InteractiveQuestion>
);
