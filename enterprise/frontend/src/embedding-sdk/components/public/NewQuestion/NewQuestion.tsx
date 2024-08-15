import { useState } from "react";
import { usePreviousDistinct } from "react-use";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Button, Group, Stack, Tabs, Title } from "metabase/ui";

import {
  Notebook,
  QuestionVisualization,
} from "../../private/InteractiveQuestion/components";
import {
  InteractiveQuestionProvider,
  useInteractiveQuestionContext,
} from "../../private/InteractiveQuestion/context";

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

const ResetQuestionButton = ({ onClick }: { onClick?: () => void } = {}) => {
  const { onReset } = useInteractiveQuestionContext();

  const handleReset = () => {
    onReset?.();
    onClick?.();
  };

  return <Button onClick={handleReset}>Reset</Button>;
};

const NewQuestionInner = () => {
  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | "save" | null | (string & unknown)
  >("notebook");

  const { queryResults } = useInteractiveQuestionContext();

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
    <Tabs
      value={activeTab}
      onTabChange={setActiveTab}
      style={{
        // we have to use a style tag because Mantine uses inline styles for defining flex direction
        flexDirection: "column",
      }}
      display="flex"
      h="100%"
    >
      <Group w="100%" position="apart">
        <Tabs.List>
          <Group>
            <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
            {queryResults && (
              <Tabs.Tab value="visualization">Visualization</Tabs.Tab>
            )}
          </Group>
        </Tabs.List>
        {activeTab !== "save" && (
          <Group>
            <ResetQuestionButton onClick={() => setActiveTab("notebook")} />
            {/* using a button instead of a tab for styling reasons */}
            <Button onClick={onSaveButtonClick}>Save</Button>
          </Group>
        )}
      </Group>

      <Tabs.Panel value="notebook">
        <Notebook onApply={() => setActiveTab("visualization")} />
      </Tabs.Panel>
      <Tabs.Panel value="visualization" style={{ flex: 1 }}>
        <QuestionVisualization />
      </Tabs.Panel>
      <Tabs.Panel value="save">
        <SaveQuestion onClose={returnToPreviousTab} />
      </Tabs.Panel>
    </Tabs>
  );
};

export const NewQuestion = withPublicComponentWrapper(() => (
  <InteractiveQuestionProvider>
    {/* 
    We can't inline this component, I *think* due to re-rendering reasons. 
    Otherwise the question will reset every time the component re-renders.
     */}
    <NewQuestionInner />
  </InteractiveQuestionProvider>
));
