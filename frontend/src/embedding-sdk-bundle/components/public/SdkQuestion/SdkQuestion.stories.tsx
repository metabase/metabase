import type { StoryFn } from "@storybook/react-webpack5";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk-bundle/test/storybook-id-args";
import { Box } from "metabase/ui";
import {
  createMockNativeCard,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockParameter,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { SdkQuestion } from "./SdkQuestion";
import { nativeQuestionWithParametersData } from "./data/data";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

type SdkQuestionComponentProps = ComponentProps<typeof SdkQuestion>;

export default {
  title: "EmbeddingSDK/SdkQuestion",
  component: SdkQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    title: {
      options: [
        undefined,
        true,
        false,
        "Custom Title",
        "Long title".repeat(10),
      ],
      control: { type: "radio" },
    },
    questionId: questionIdArgType,
    entityTypes: {
      options: [
        "model",
        "table",
        "model_table",
        "empty",
        "null",
        "undefined",
        "invalid",
      ],
      mapping: {
        model: ["model"],
        table: ["table"],
        model_table: ["model", "table"],
        empty: [],
        null: null,
        undefined: undefined,
        invalid: ["metric", "question"],
      },
      control: {
        type: "select",
        labels: {
          model: "Model only",
          table: "Table only",
          model_table: "Model and Table",
        },
      },
    },
  },
};

const Template: StoryFn<SdkQuestionComponentProps> = (args) => {
  return (
    <Box bg="background-primary" mih="100vh">
      <SdkQuestion {...args} />
    </Box>
  );
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    targetCollection: undefined,
    title: true,
  },
};

export const WithEditableSqlParametersCustomLayout = {
  render(args: SdkQuestionComponentProps) {
    return (
      <Box bg="background-primary" mih="100vh">
        <SdkQuestion {...args}>
          <SdkQuestion.Title />
          <SdkQuestion.SqlParametersList />
          <SdkQuestion.QuestionVisualization />
        </SdkQuestion>
      </Box>
    );
  },

  args: {
    questionId: QUESTION_ID,
    initialSqlParameters: {
      State: "AR",
    },
    hiddenParameters: ["Source"],
  },

  parameters: {
    msw: {
      handlers: [
        http.get(`*/api/card/${QUESTION_ID}`, () =>
          HttpResponse.json(
            createMockNativeCard({
              name: "Test Question",
              display: "table",
              id: QUESTION_ID,
              dataset_query: createMockNativeDatasetQuery({
                native: createMockNativeQuery({
                  query:
                    "SELECT * FROM people WHERE state = {{State}} [[ and city = {{City}} ]] [[ and source = {{Source}} ]]",
                  "template-tags": {
                    State: {
                      type: "text",
                      name: "State",
                      id: "1",
                      "display-name": "State",
                    },
                    City: {
                      type: "text",
                      name: "City",
                      id: "2",
                      "display-name": "City",
                    },
                    Source: {
                      type: "text",
                      name: "Source",
                      id: "3",
                      "display-name": "Source",
                    },
                  },
                }),
                database: SAMPLE_DB_ID,
              }),
              parameters: [
                createMockParameter({
                  id: "1",
                  slug: "State",
                }),
                createMockParameter({
                  id: "2",
                  slug: "City",
                }),
                createMockParameter({
                  id: "3",
                  slug: "Source",
                }),
              ],
            }),
          ),
        ),
        http.post(`*/api/card/${QUESTION_ID}/query`, () =>
          HttpResponse.json(nativeQuestionWithParametersData),
        ),
      ],
    },
  },
};

export const EditorOnly = {
  render(args: SdkQuestionComponentProps) {
    return (
      <Box bg="background-primary" mih="100vh">
        <SdkQuestion {...args}>
          <SdkQuestion.Editor />
        </SdkQuestion>
      </Box>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    targetCollection: undefined,
  },
};

export const CreateQuestion = {
  render(args: SdkQuestionComponentProps) {
    return (
      <Box bg="background-primary" mih="100vh">
        <SdkQuestion {...args} />
      </Box>
    );
  },
  args: {
    questionId: "new",
    entityTypes: ["model"],
  },
};
