import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react/*";
import { HttpResponse, http } from "msw";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { commonReducers } from "metabase/reducers-common";
import { registerVisualization } from "metabase/visualizations";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import { PieChart } from "metabase/visualizations/visualizations/PieChart";
import type { DatasetData } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockPieRow,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { Editor, type EditorProps } from "./Editor";
import Data from "./data/data.json";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(PieChart);

const settings = mockSettings();

const storeInitialState = createMockState({
  settings,
  entities: createMockEntitiesState({}),
});
const publicReducerNames = Object.keys(commonReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;

const storeMiddleware = [Api.middleware];

const store = getStore(
  commonReducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
};

const DefaultTemplate = (args: EditorProps) => <Editor {...args} />;

export default {
  title: "Components/Documents",
  component: Editor,
  decorators: [ReduxDecorator],
  layout: "fullscreen",
  parameters: {
    msw: {
      handlers: [
        http.get("/api/card/114", () =>
          HttpResponse.json(
            createMockCard({
              name: "Test Question",
              display: "line",
              id: 114,
            }),
          ),
        ),
        http.get("/api/card/114/query_metadata", () =>
          HttpResponse.json(createMockCardQueryMetadata()),
        ),
        http.post("/api/card/114/query", () =>
          HttpResponse.json(
            createMockDataset({
              data: Data.card114Query.data as unknown as DatasetData,
            }),
          ),
        ),
        http.get("/api/card/115", () =>
          HttpResponse.json(
            createMockCard({
              name: "Test Pie Question",
              display: "pie",
              id: 115,
              visualization_settings: {
                "pie.rows": [
                  createMockPieRow({
                    name: "This is a really long name that will push the chart over",
                  }),
                ],
              },
            }),
          ),
        ),
        http.get("/api/card/115/query_metadata", () =>
          HttpResponse.json(createMockCardQueryMetadata()),
        ),
        http.post("/api/card/115/query", () =>
          HttpResponse.json(
            createMockDataset({
              data: Data.card114Query.data as unknown as DatasetData,
            }),
          ),
        ),
      ],
    },
  },
};

export const Markdown = {
  render: DefaultTemplate,
  args: {
    initialContent: Data.markdownTest,
  },
};

export const CardEmbed = {
  render: DefaultTemplate,
  args: {
    initialContent: Data.cardEmbed,
  },
};
