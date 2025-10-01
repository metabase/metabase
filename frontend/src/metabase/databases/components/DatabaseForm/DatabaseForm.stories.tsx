import type { StoryFn } from "@storybook/react";

import { getStore } from "__support__/entities-store";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseForm } from "./DatabaseForm";
import { TEST_ENGINES } from "./tests/setup";

export default {
  title: "App/Databases/DatabaseForm",
  component: DatabaseForm,
  decorators: [ReduxDecorator],
};

const initialState = createMockState({
  settings: createMockSettingsState({
    engines: TEST_ENGINES,
  }),
});

const store = getStore(publicReducers, initialState, []);

function ReduxDecorator(Story: StoryFn) {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
}

export const Default = () => (
  <DatabaseForm
    initialValues={{
      engine: "postgres",
    }}
    location="full-page"
    config={{ isAdvanced: true }}
  />
);
