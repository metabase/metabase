import {
  setupNativeDatasetEndpoints,
  setupErrorNativeDatasetEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createMockQueryBuilderState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { NotebookNativePreview } from "./NotebookNativePreview";

const noPermissionsCard = createMockCard({
  dataset_query: { ...createMockStructuredDatasetQuery(), database: null },
});

const regularCard = createMockCard();

// json, sql
// empty sidebar
// error
// query

const setup = ({ card = regularCard, errored = false } = {}) => {
  const state = createMockState({
    qb: createMockQueryBuilderState({ card }),
    settings: createMockSettingsState({
      "notebook-native-preview-shown": true,
    }),
  });

  errored ? setupErrorNativeDatasetEndpoints() : setupNativeDatasetEndpoints();

  renderWithProviders(<NotebookNativePreview />, {
    storeInitialState: state,
  });
};

describe("NotebookNativePreview", () => {
  it("should alert that there was an error", async () => {
    setup({ errored: true });
    expect(
      await screen.findByText("Error generating the query."),
    ).toBeInTheDocument();
  });

  it('should show empty sidebar when "canRun" is false', () => {
    setup({ card: noPermissionsCard });
    expect(
      screen.getByTestId("native-query-preview-sidebar"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Convert this question to SQL" }),
    ).toBeDisabled();
  });
});
