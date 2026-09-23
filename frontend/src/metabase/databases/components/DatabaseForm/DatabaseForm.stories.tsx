import { HttpResponse, http } from "msw";

import { createMockState } from "__support__/state";
import { ReduxProvider } from "__support__/storybook";

import { DatabaseForm } from "./DatabaseForm";
import { TEST_ENGINES } from "./tests/setup";

export default {
  title: "App/Databases/DatabaseForm",
  component: DatabaseForm,
  parameters: {
    msw: {
      handlers: [
        http.get("/api/database/engines", () =>
          HttpResponse.json(TEST_ENGINES),
        ),
      ],
    },
  },
};

const initialState = createMockState();

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
