import { useState } from "react";
import { usePreviousDistinct } from "react-use";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  Notebook,
  QuestionVisualization,
} from "embedding-sdk/components/public/InteractiveQuestion/components";
import {
  InteractiveQuestionProvider,
  useInteractiveQuestionContext,
} from "embedding-sdk/components/public/InteractiveQuestion/context";
import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Button, Group, Stack, Tabs, Title, Box } from "metabase/ui";

const SaveQuestion = ({ onClose }: { onClose: () => void }) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

  if (!question) {
    return null;
  }

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion ?? null}
      onCreate={handleCreate}
      onSave={handleSave}
      multiStep={false}
      initialCollectionId={null}
    >
      <Stack p="md">
        <Title>
          <SaveQuestionTitle />
        </Title>
        <SaveQuestionForm onCancel={onClose} />
      </Stack>
    </SaveQuestionProvider>
  );
};

const ResetQuestionButton = () => {
  const { onReset } = useInteractiveQuestionContext();

  return <Button onClick={onReset}>Reset</Button>;
};

const NewQuestionInner = () => {
  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | "save" | null | (string & unknown)
  >("notebook");

  const previousTab = usePreviousDistinct(activeTab);

  const returnToPreviousTab = () => {
    if (previousTab) {
      return setActiveTab(previousTab);
    }
  };

  const onSaveButtonClick = () => {
    if (activeTab === "save") {
      returnToPreviousTab();
    } else {
      setActiveTab("save");
    }
  };

  return (
    <Box p="lg">
      <Tabs value={activeTab} onTabChange={setActiveTab}>
        <Group w="100%" position="apart">
          <Tabs.List>
            <Group>
              <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
              <Tabs.Tab value="visualization">Visualization</Tabs.Tab>
            </Group>
          </Tabs.List>
          <Group>
            <ResetQuestionButton />
            {/* using a button instead of a tab for styling reasons */}
            <Button onClick={onSaveButtonClick}>Save</Button>
          </Group>
        </Group>

        <Tabs.Panel value="notebook">
          <Notebook onApply={() => setActiveTab("visualization")} />
        </Tabs.Panel>
        <Tabs.Panel value="visualization">
          <QuestionVisualization />
        </Tabs.Panel>
        <Tabs.Panel value="save" p={0}>
          <SaveQuestion onClose={returnToPreviousTab} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};

export const NewQuestion = withPublicComponentWrapper(() => (
  <InteractiveQuestionProvider options={{}}>
    {/* 
    We can't inline this component, I *think* due to re-rendering reasons. 
    Otherwise the question will reset every time the component re-renders.
     */}
    <NewQuestionInner />
  </InteractiveQuestionProvider>
));
