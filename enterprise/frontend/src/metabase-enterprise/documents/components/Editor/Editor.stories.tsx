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
import type { DatasetData } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { Editor, type EditorProps } from "./Editor";
import Data from "./data/data.json";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);

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
            }),
          ),
        ),
        http.post("/api/card/114/query", () =>
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
