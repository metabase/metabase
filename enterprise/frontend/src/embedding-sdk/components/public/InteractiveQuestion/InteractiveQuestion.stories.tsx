import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Stack } from "metabase/ui";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

type InteractiveQuestionComponentProps = ComponentProps<
  typeof InteractiveQuestion
>;

export default {
  title: "EmbeddingSDK/InteractiveQuestion",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<InteractiveQuestionComponentProps> = args => {
  return <InteractiveQuestion {...args} />;
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};

export const WithCustomSaveForm = {
  render(args: InteractiveQuestionComponentProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [isBeforeSaveCalled, setBeforeSaveCalled] = useState(false);

    return (
      <InteractiveQuestion
        onSave={() => {
          setIsSaved(true);
        }}
        onBeforeSave={async () => {
          setBeforeSaveCalled(true);
        }}
        {...args}
      >
        <InteractiveQuestion.QuestionVisualization />

        <Stack h="200px">
          <InteractiveQuestion.SaveQuestionForm />
        </Stack>

        <div>
          {isBeforeSaveCalled && <div>Before save called!</div>}
          {isSaved && <div>Saved!</div>}
        </div>
      </InteractiveQuestion>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
  },
};
