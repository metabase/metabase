import { ReduxProvider } from "__support__/storybook";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseForm } from "./DatabaseForm";
import { TEST_ENGINES } from "./tests/setup";

export default {
  title: "App/Databases/DatabaseForm",
  component: DatabaseForm,
};

const initialState = createMockState({
  settings: createMockSettingsState({
    engines: TEST_ENGINES,
  }),
});

export const Default = () => (
  <ReduxProvider storeInitialState={initialState}>
    <DatabaseForm
      initialValues={{
        engine: "postgres",
      }}
      location="full-page"
      config={{ isAdvanced: true }}
    />
  </ReduxProvider>
);
