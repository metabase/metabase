import { useState } from "react";

import {
  InteractiveQuestionProvider,
  useInteractiveQuestionContext,
} from "embedding-sdk/components/public/InteractiveQuestion/context";
import { SaveQuestionForm } from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useSelector } from "metabase/lib/redux";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Stack, Tabs, Title, Group, Overlay } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import {
  Notebook,
  QuestionVisualization,
} from "../InteractiveQuestion/components";

export const SaveQuestion = ({ onClose }: { onClose: () => void }) => {
  const { question } = useInteractiveQuestionContext();

  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

  if (!question) {
    return null;
  }

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={null}
      onCreate={handleCreate}
      onSave={handleSave}
      multiStep={false}
      initialCollectionId={null}
    >
      <Stack>
        <Title></Title>
        <SaveQuestionForm onCancel={onClose} />
      </Stack>
    </SaveQuestionProvider>
  );
};

export const NewQuestion = () => {
  const metadata = useSelector(getMetadata);
  const newCard = Question.create({ metadata }).card();

  const [isSaving, setIsSaving] = useState(false);

  return (
    <InteractiveQuestionProvider deserializedCard={newCard} options={{}}>
      <Box w="100%" h="100%" pos="relative">
        {isSaving && (
          <Overlay bg="bg-white">
            <SaveQuestion onClose={() => setIsSaving(false)} />
          </Overlay>
        )}
        <Tabs defaultValue="notebook">
          <Group position="apart">
            <Tabs.List>
              <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
              <Tabs.Tab value="visualization">Visualization</Tabs.Tab>
            </Tabs.List>
            <Button onClick={() => setIsSaving(true)}>Save</Button>
          </Group>

          <Tabs.Panel value="notebook">
            <Notebook />
          </Tabs.Panel>
          <Tabs.Panel value="visualization">
            <QuestionVisualization />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </InteractiveQuestionProvider>
  );
};
