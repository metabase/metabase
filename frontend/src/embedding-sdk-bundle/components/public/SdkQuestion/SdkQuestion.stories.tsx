import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  ParametersPlayground,
  useControlledParametersPlaygroundState,
} from "embedding-sdk-bundle/test/ParametersPlayground";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk-bundle/test/storybook-id-args";
import { Box, Stack } from "metabase/ui";
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
    dataPicker: {
      control: { type: "select" },
      options: ["flat", "staged"],
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
    dataPicker: "flat",
  },
};

const ControlledSqlParametersPlayground = (args: SdkQuestionComponentProps) => {
  const playground = useControlledParametersPlaygroundState({
    initialValues: args.sqlParameters ?? args.initialSqlParameters ?? {},
  });

  return (
    <ParametersPlayground
      {...playground}
      title="Controlled SQL parameters"
      description={
        <>
          Push a SQL parameter value into the question without clicking its
          filter UI — mimics a barcode scanner or app-state reflection. The
          mocked query handler returns 15 synthetic rows across 5 states / 15
          cities / 3 sources (Twitter, Google, Organic) and filters them by
          every pushed param, so the visualization reacts to pushes.
        </>
      }
      dashboard={
        <Box bg="background-primary" mih="100vh" p="md">
          <SdkQuestion
            {...args}
            sqlParameters={playground.parameters}
            onSqlParametersChange={playground.handleParametersChange}
          >
            <Stack gap="md">
              <SdkQuestion.SqlParametersList />
              <SdkQuestion.QuestionVisualization />
            </Stack>
          </SdkQuestion>
        </Box>
      }
    />
  );
};

/**
 * Column indices in `nativeQuestionWithParametersData.data.rows`. The
 * mock rows are all `state = "AR"`, so we synthesize a more diverse
 * dataset below (multiple states / cities / sources) to make the smart
 * query handler's filtering visible across all three params.
 */
const NAME_COLUMN_INDEX = 4;
const CITY_COLUMN_INDEX = 5;
const STATE_COLUMN_INDEX = 7;
const SOURCE_COLUMN_INDEX = 8;

type SyntheticPerson = { state: string; city: string; source: string };

const SYNTHETIC_PEOPLE: SyntheticPerson[] = [
  { state: "AR", city: "Little Rock", source: "Twitter" },
  { state: "AR", city: "Fayetteville", source: "Google" },
  { state: "AR", city: "Hot Springs", source: "Organic" },
  { state: "NY", city: "New York", source: "Twitter" },
  { state: "NY", city: "Buffalo", source: "Organic" },
  { state: "NY", city: "Rochester", source: "Google" },
  { state: "CA", city: "Los Angeles", source: "Google" },
  { state: "CA", city: "San Francisco", source: "Twitter" },
  { state: "CA", city: "San Diego", source: "Organic" },
  { state: "TX", city: "Houston", source: "Organic" },
  { state: "TX", city: "Austin", source: "Google" },
  { state: "TX", city: "Dallas", source: "Twitter" },
  { state: "WA", city: "Seattle", source: "Twitter" },
  { state: "WA", city: "Spokane", source: "Organic" },
  { state: "WA", city: "Tacoma", source: "Google" },
];

const SYNTHETIC_PEOPLE_ROWS = SYNTHETIC_PEOPLE.map((person, index) => {
  const template = [...nativeQuestionWithParametersData.data.rows[0]];
  template[0] = index + 1; // unique ID
  template[NAME_COLUMN_INDEX] = `${person.city} resident`;
  template[CITY_COLUMN_INDEX] = person.city;
  template[STATE_COLUMN_INDEX] = person.state;
  template[SOURCE_COLUMN_INDEX] = person.source;
  return template;
});

export const ControlledSqlParameters = {
  render: (args: SdkQuestionComponentProps) => (
    <ControlledSqlParametersPlayground {...args} />
  ),
  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: false,
    title: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`*/api/card/${QUESTION_ID}`, () =>
          HttpResponse.json(
            createMockNativeCard({
              name: "Controlled SQL parameters demo",
              display: "table",
              id: QUESTION_ID,
              dataset_query: createMockNativeDatasetQuery({
                native: createMockNativeQuery({
                  query:
                    "SELECT * FROM people WHERE state = {{state}} [[ and city = {{city}} ]] [[ and source = {{source}} ]]",
                  "template-tags": {
                    state: {
                      type: "text",
                      name: "state",
                      id: "1",
                      "display-name": "State",
                    },
                    city: {
                      type: "text",
                      name: "city",
                      id: "2",
                      "display-name": "City",
                    },
                    source: {
                      type: "text",
                      name: "source",
                      id: "3",
                      "display-name": "Source",
                    },
                  },
                }),
                database: SAMPLE_DB_ID,
              }),
              parameters: [
                createMockParameter({ id: "1", slug: "state" }),
                createMockParameter({ id: "2", slug: "city" }),
                createMockParameter({ id: "3", slug: "source" }),
              ],
            }),
          ),
        ),
        // Smart query handler: filters rows by the pushed state / city /
        // source params so the visualization reacts visibly to every push.
        http.post(`*/api/card/${QUESTION_ID}/query`, async ({ request }) => {
          const body = (await request.json()) as {
            parameters?: Array<{ id: string; value: unknown }>;
          };
          const paramValueById = new Map<string, string>();
          for (const param of body.parameters ?? []) {
            if (param.value !== null && param.value !== undefined) {
              paramValueById.set(param.id, String(param.value));
            }
          }

          const filterByParam = (
            rows: typeof SYNTHETIC_PEOPLE_ROWS,
            paramId: string,
            columnIndex: number,
          ) => {
            const value = paramValueById.get(paramId);
            if (value === undefined) {
              return rows;
            }
            return rows.filter((row) => row[columnIndex] === value);
          };

          let filteredRows: typeof SYNTHETIC_PEOPLE_ROWS =
            SYNTHETIC_PEOPLE_ROWS;
          filteredRows = filterByParam(filteredRows, "1", STATE_COLUMN_INDEX);
          filteredRows = filterByParam(filteredRows, "2", CITY_COLUMN_INDEX);
          filteredRows = filterByParam(filteredRows, "3", SOURCE_COLUMN_INDEX);

          return HttpResponse.json({
            ...nativeQuestionWithParametersData,
            data: {
              ...nativeQuestionWithParametersData.data,
              rows: filteredRows,
            },
            row_count: filteredRows.length,
          });
        }),
      ],
    },
  },
};
