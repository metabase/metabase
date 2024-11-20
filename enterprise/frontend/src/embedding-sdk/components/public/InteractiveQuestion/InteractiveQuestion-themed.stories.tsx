import type { ComponentProps } from "react";

import { MetabaseProvider, defineEmbeddingSdkTheme } from "embedding-sdk";
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

const colors = {
  primary: "#DF75E9",
  filter: "#7ABBF9",
  lighterGrey: "#E3E7E4",
  lightGrey: "#ADABA9",
  darkGrey: "#3B3F3F",
  background: "#151C20",
};

const darkTheme = defineEmbeddingSdkTheme({
  fontFamily: "Inter",
  fontSize: "14px",
  colors: {
    brand: colors.primary,
    "brand-hover": colors.darkGrey,
    "brand-hover-light": colors.darkGrey,
    filter: colors.filter,
    "text-primary": colors.lighterGrey,
    "text-secondary": colors.lighterGrey,
    "text-tertiary": colors.lighterGrey,
    border: colors.darkGrey,
    background: colors.background,
    "background-secondary": colors.darkGrey,
    "background-hover": colors.background,
    "background-disabled": colors.darkGrey,
    charts: [
      colors.primary,
      colors.filter,
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
        border: `"1px solid ${colors.darkGrey}"`,
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

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MetabaseProvider config={storybookSdkDefaultConfig} theme={darkTheme}>
    <Box p="xl" bg={colors.background}>
      {children}
    </Box>
  </MetabaseProvider>
);

export const DarkTheme = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <Wrapper>
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
      <Wrapper>
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
