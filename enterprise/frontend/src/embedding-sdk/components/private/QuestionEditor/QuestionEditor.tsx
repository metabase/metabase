import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";
import { ChartTypeSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings";
import { useChartVisualizationSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings/ChartTypeSettings";
import { Box, Group, Overlay, Paper, Tabs } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

export type QuestionEditorProps = {
  isSaveEnabled?: boolean;
};

const QuestionEditorInner = ({ isSaveEnabled }: QuestionEditorProps) => {
  const { updateQuestion, question, queryResults, runQuestion } =
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

  const {
    selectedVisualization,
    setSelectedVisualization,
    makesSense,
    nonSense,
  } = useChartVisualizationSettings({
    question,
    result: queryResults?.[0],
    query: question
      ? question.legacyQuery({ useStructuredQuery: true })
      : undefined,
    onVisualizationChange: updateQuestion,
  });

  return (
    <Box w="100%" h="100%">
      <div>
        {question && (
          <ChartTypeSettings
            selectedVisualization={selectedVisualization}
            setSelectedVisualization={setSelectedVisualization}
            makesSense={makesSense}
            nonSense={nonSense}
          />
        )}
      </div>
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
              {isSaveEnabled && (
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

      {isSaveEnabled && isSaveFormOpen && (
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
  isSaveEnabled = true,
  plugins,
}: InteractiveQuestionProps & QuestionEditorProps) => (
  <InteractiveQuestion questionId={questionId} plugins={plugins}>
    <QuestionEditorInner isSaveEnabled={isSaveEnabled} />
  </InteractiveQuestion>
);
