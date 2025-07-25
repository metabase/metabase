import type { StoryFn } from "@storybook/react";
import { useEffect, useRef } from "react";

import type { MetabaseProviderProps } from "embedding-sdk";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "../metabase-provider.web-component";
import "./interactive-question.web-component";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/web-component",
  component: "interactive-question",
  parameters: {
    layout: "fullscreen",
  },
};

const withDefinedAttributes = (Story: StoryFn) => (
  <metabase-provider
    metabase-instance-url={config.metabaseInstanceUrl}
    fetch-request-token="fetchRequestToken"
  >
    <Story />
  </metabase-provider>
);

const withDefinedProperties = (Story: StoryFn) => {
  const ref = useRef<
    (HTMLElement & Pick<MetabaseProviderProps, "authConfig" | "theme">) | null
  >(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.authConfig = config;

    setTimeout(() => {
      if (!ref.current) {
        return;
      }

      ref.current.theme = {
        colors: { brand: "blue" },
        fontFamily: "Impact",
      };
    }, 3000);
  });

  return (
    <metabase-provider ref={ref}>
      <Story />
    </metabase-provider>
  );
};

export const Question = () => (
  <interactive-question question-id={QUESTION_ID} />
);
Question.decorators = [withDefinedAttributes];

export const QuestionWithDefinedProperties = () => (
  <interactive-question question-id={QUESTION_ID} />
);
QuestionWithDefinedProperties.decorators = [withDefinedProperties];

export const NewQuestion = () => <interactive-question question-id="new" />;
NewQuestion.decorators = [withDefinedAttributes];
