import { useState } from "react";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import {
  Button,
  Group,
  Stack,
  Tabs,
  Title,
  Box,
  Overlay,
  Paper,
  Center,
} from "metabase/ui";

import {
  Notebook,
  QuestionVisualization,
} from "../../private/InteractiveQuestion/components";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
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
    "notebook" | "visualization" | null | (string & unknown)
  >("notebook");

  const [isSaving, setIsSaving] = useState(false);

  const { queryResults } = useInteractiveQuestionContext();

  return (
    <Box pos="relative" h="100%" w="100%">
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
              <Button onClick={() => setIsSaving(true)}>Save</Button>
            </Group>
          )}
        </Group>

        <Tabs.Panel value="notebook">
          <Notebook onApply={() => setActiveTab("visualization")} />
        </Tabs.Panel>
        <Tabs.Panel value="visualization" style={{ flex: 1 }}>
          <QuestionVisualization />
        </Tabs.Panel>
      </Tabs>

      {isSaving && (
        <Box pos="absolute" top={0} left={0} h="100%" w="100%">
          <Overlay>
            <Center h="100%" w="100%">
              <Paper>
                <SaveQuestion onClose={() => setIsSaving(false)} />
              </Paper>
            </Center>
          </Overlay>
        </Box>
      )}
    </Box>
  );
};

export const NewQuestion = withPublicComponentWrapper(
  ({
    cancelDeferred,
    cardId,
    componentPlugins,
    deserializedCard,
    onNavigateBack,
    onReset,
    options = {},
  }: Partial<Omit<InteractiveQuestionProviderProps, "children">>) => (
    <InteractiveQuestionProvider
      cardId={cardId}
      options={options}
      deserializedCard={deserializedCard}
      componentPlugins={componentPlugins}
      onReset={onReset}
      onNavigateBack={onNavigateBack}
      cancelDeferred={cancelDeferred}
    >
      {/*
    We can't inline this component, I *think* due to re-rendering reasons. 
    Otherwise the question will reset every time the component re-renders.
     */}
      <NewQuestionInner />
    </InteractiveQuestionProvider>
  ),
);
