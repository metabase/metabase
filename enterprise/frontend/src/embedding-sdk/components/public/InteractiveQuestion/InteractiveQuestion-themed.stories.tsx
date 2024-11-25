import type { ComponentProps, ReactNode } from "react";

import {
  MetabaseProvider,
  type MetabaseTheme,
  defineEmbeddingSdkTheme,
} from "embedding-sdk";
import { storybookSdkDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

type InteractiveQuestionComponentProps = ComponentProps<
  typeof InteractiveQuestion
>;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Themed",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
};

const darkColors = {
  primary: "#DF75E9",
  filter: "#7ABBF9",
  lighterGrey: "#E3E7E4",
  lightGrey: "#ADABA9",
  darkGrey: "#3B3F3F",
  background: "#151C20",
};

const darkTheme = defineEmbeddingSdkTheme({
  fontFamily: "Lato",
  fontSize: "14px",
  colors: {
    brand: darkColors.primary,
    "brand-hover": darkColors.darkGrey,
    "brand-hover-light": darkColors.darkGrey,
    filter: darkColors.filter,
    "text-primary": darkColors.lighterGrey,
    "text-secondary": darkColors.lighterGrey,
    "text-tertiary": darkColors.lighterGrey,
    border: darkColors.darkGrey,
    background: darkColors.background,
    "background-secondary": darkColors.darkGrey,
    "background-hover": darkColors.background,
    "background-disabled": darkColors.darkGrey,
    "background-inverse": darkColors.background,
    charts: [
      darkColors.primary,
      darkColors.filter,
      "#ED6A5A",
      "#FED18C",
      "#82A74B",
      "#FF8D69",
      "#ED6A5A",
      "#FED18C",
    ],
    positive: "#45DF4C",
    negative: "#FF3389",
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      card: {
        border: `"1px solid ${darkColors.darkGrey}"`,
        backgroundColor: "#212426",
      },
    },
    number: {
      value: {
        fontSize: "18px",
        lineHeight: "22px",
      },
    },
  },
});

const Wrapper = ({
  children,
  theme,
}: {
  children: ReactNode;
  theme: MetabaseTheme;
}) => (
  <MetabaseProvider config={storybookSdkDefaultConfig} theme={theme}>
    <Box p="xl" bg={theme.colors?.background}>
      {children}
    </Box>
  </MetabaseProvider>
);

export const DarkTheme = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <Wrapper theme={darkTheme}>
        <InteractiveQuestion {...args} />;
      </Wrapper>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};

export const DarkThemeEditor = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <Wrapper theme={darkTheme}>
        <InteractiveQuestion {...args}>
          <InteractiveQuestion.Editor />
        </InteractiveQuestion>
      </Wrapper>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};

export const WithLightTooltip = {
  render(args: InteractiveQuestionComponentProps) {
    const theme = defineEmbeddingSdkTheme({
      colors: {
        "background-inverse": "#fff",
        "text-inverse": "#2d2d30",
      },
    });

    return (
      <Wrapper theme={theme}>
        <InteractiveQuestion {...args} />
      </Wrapper>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};
