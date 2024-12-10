import { type MetabaseTheme, defineMetabaseTheme } from "embedding-sdk";

import { InteractiveQuestion } from "./InteractiveQuestion";
import { Wrapper, darkTheme } from "./util";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Themed",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
};

const DefaultTemplate = (theme: MetabaseTheme) => (
  <Wrapper theme={theme}>
    <InteractiveQuestion questionId={QUESTION_ID} isSaveEnabled />
  </Wrapper>
);

export const DarkTheme = {
  render: DefaultTemplate,
  args: darkTheme,
};

export const DarkThemeEditor = {
  render: (theme: MetabaseTheme) => (
    <Wrapper theme={theme}>
      <InteractiveQuestion questionId={QUESTION_ID} isSaveEnabled>
        <InteractiveQuestion.Editor />
      </InteractiveQuestion>
    </Wrapper>
  ),
  args: darkTheme,
};

export const WithWhiteTooltip = {
  render: DefaultTemplate,

  args: defineMetabaseTheme({
    components: {
      tooltip: {
        textColor: "#2f3542",
        secondaryTextColor: "#57606f",
        backgroundColor: "#ffffff",
        focusedBackgroundColor: "#f1f2f6",
      },
    },
  }),
};
