import type { ReactNode } from "react";

import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIds } from "embedding-sdk/test/storybook-id-args";
import { storybookThemes } from "embedding-sdk/test/storybook-themes";
import {
  type MetabaseTheme,
  defineMetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { Box } from "metabase/ui";

import { MetabaseProvider } from "../MetabaseProvider";

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
