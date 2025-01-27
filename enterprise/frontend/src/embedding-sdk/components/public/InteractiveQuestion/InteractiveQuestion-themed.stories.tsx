import type { ReactNode } from "react";

import {
  MetabaseProvider,
  type MetabaseTheme,
  defineMetabaseTheme,
} from "embedding-sdk";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { getSdkStorybookDarkTheme } from "embedding-sdk/test/storybook-dark-theme";
import { Box } from "metabase/ui";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Themed",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
};

const darkTheme = getSdkStorybookDarkTheme();

const Wrapper = ({
  children,
  theme,
}: {
  children: ReactNode;
  theme: MetabaseTheme;
}) => (
  <MetabaseProvider theme={theme} authConfig={storybookSdkAuthDefaultConfig}>
    <Box p="xl" bg={theme.colors?.background}>
      {children}
    </Box>
  </MetabaseProvider>
);

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
