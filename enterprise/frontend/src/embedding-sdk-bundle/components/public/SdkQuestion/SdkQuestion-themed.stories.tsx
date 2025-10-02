import type { ReactNode } from "react";

import {
  MetabaseProvider,
  type MetabaseTheme,
  defineMetabaseTheme,
} from "embedding-sdk-bundle";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { questionIds } from "embedding-sdk-bundle/test/storybook-id-args";
import { storybookThemes } from "embedding-sdk-bundle/test/storybook-themes";
import { Box } from "metabase/ui";

import { SdkQuestion } from "./SdkQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

export default {
  title: "EmbeddingSDK/SdkQuestion/Themed",
  component: SdkQuestion,
  parameters: {
    layout: "fullscreen",
  },
};

const darkTheme = storybookThemes.dark;

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
    <SdkQuestion questionId={QUESTION_ID} isSaveEnabled />
  </Wrapper>
);

export const DarkTheme = {
  render: DefaultTemplate,
  args: darkTheme,
};

export const DarkThemeEditor = {
  render: (theme: MetabaseTheme) => (
    <Wrapper theme={theme}>
      <SdkQuestion questionId={QUESTION_ID} isSaveEnabled>
        <SdkQuestion.Editor />
      </SdkQuestion>
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
