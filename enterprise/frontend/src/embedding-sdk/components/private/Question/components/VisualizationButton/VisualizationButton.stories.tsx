import { useState } from "react";

import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Stack, Text } from "metabase/ui";

import { useRunVisualization } from "../../hooks/use-run-visualization";

import { VisualizationButton } from "./VisualizationButton";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/VisualizationButton",
  component: VisualizationButton,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const QuestionVisualizationButton = {
  render() {
    const [count, setCount] = useState(0);
    return (
      <Box p="lg">
        <Question
          questionId={QUESTION_ID}
          onRun={() => setCount((cnt) => cnt + 1)}
        >
          <Box>
            <Stack justify="space-between" w="100%">
              <Text>You&apos;ve run {count} queries.</Text>
              <Question.VisualizationButton />
            </Stack>
            <Question.Editor hasVisualizeButton={false}></Question.Editor>
            <Question.QuestionVisualization />
          </Box>
        </Question>
      </Box>
    );
  },
};

export const CustomVisualizationButton = {
  render() {
    const OisinsRandomButton = () => {
      const { visualizeQuestion } = useRunVisualization();
      return (
        <Button onClick={visualizeQuestion}>
          This is a random button, brought to you by Oisin
        </Button>
      );
    };

    const [count, setCount] = useState(0);

    return (
      <Box p="lg">
        <Question
          questionId={QUESTION_ID}
          onRun={() => setCount((cnt) => cnt + 1)}
        >
          <Box>
            <Stack justify="space-between" w="100%">
              <OisinsRandomButton />
              <Text>You&apos;ve run {count} queries.</Text>
            </Stack>
            <Question.Editor hasVisualizeButton={false}></Question.Editor>
            <Question.QuestionVisualization />
          </Box>
        </Question>
      </Box>
    );
  },
};
