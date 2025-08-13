import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react/*";
import _ from "underscore";

import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import { getStore } from "metabase/store";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { Editor } from "./Editor";
import Data from "./data/data.json";

const storeInitialState = createMockState({
  settings: mockSettings(),
  entities: createMockEntitiesState({}),
});
const publicReducerNames = Object.keys(publicReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;
const reducers = publicReducers;

const storeMiddleware = [Api.middleware];

const store = getStore(
  reducers,
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

const DefaultTemplate = () => <Editor initialContent={Data.markdownTest} />;

export default {
  title: "Components/Documents",
  component: Editor,
  decorators: [ReduxDecorator],
  layout: "fullscreen",
};

export const Default = {
  render: DefaultTemplate,
};
