import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { Box, Group, Overlay, Paper, Tabs } from "metabase/ui";

import { InteractiveQuestion } from "../InteractiveQuestion";

export const QuestionEditor = ({
  questionId,
  plugins,
}: InteractiveQuestionProps) => {
  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | (string & unknown) | null
  >("notebook");
  const [isSaveFormOpen, { open: openSaveForm, close: closeSaveForm }] =
    useDisclosure(false);

  return (
    <InteractiveQuestion questionId={questionId} plugins={plugins}>
      <Box w="100%" h="100%">
        <Tabs
          value={activeTab}
          onTabChange={setActiveTab}
          defaultValue="notebook"
        >
          <Group position="apart">
            <Group>
              <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
              <Tabs.Tab value="visualization">Visualization</Tabs.Tab>
            </Group>
            {!isSaveFormOpen && (
              <Group>
                <InteractiveQuestion.ResetButton
                  onClick={() => {
                    setActiveTab("notebook");
                    closeSaveForm();
                  }}
                />
                <InteractiveQuestion.SaveButton onClick={openSaveForm} />
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

        {isSaveFormOpen && (
          <Overlay center>
            <Paper>
              <InteractiveQuestion.SaveQuestionForm onClose={closeSaveForm} />
            </Paper>
          </Overlay>
        )}
      </Box>
    </InteractiveQuestion>
  );
};
