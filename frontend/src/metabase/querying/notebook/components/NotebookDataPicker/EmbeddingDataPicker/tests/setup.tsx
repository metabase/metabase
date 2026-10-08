import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupLibraryEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEmbeddingDataPickerState } from "__support__/state/embedding-data-picker";
import { renderWithProviders } from "__support__/ui";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import type { Query } from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createMockModelResult,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { EmbeddingDataPicker } from "../EmbeddingDataPicker";
import { EmbeddingDataPickerContextProvider } from "../context";

interface SetupOpts {
  hasModels?: boolean;
  hasMetrics?: boolean;
  hasLibrary?: boolean;
  entityTypes?: EmbeddingEntityType[];
  contextEntityTypes?: EmbeddingEntityType[];
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
};

export function setup({
  hasModels = DEFAULT_OPTS.hasModels,
  hasMetrics = false,
  hasLibrary = false,
  entityTypes,
  contextEntityTypes,
}: SetupOpts = {}) {
  const query = createEmptyQuery();

  // `mockSettings` has to run first, as the Library plugin reads the token
  // features when it initializes.
  const settings = hasLibrary
    ? mockSettings({
        "token-features": createMockTokenFeatures({ library: true }),
      })
    : undefined;
  if (hasLibrary) {
    setupEnterpriseOnlyPlugin("library");
    setupLibraryEndpoints(true);
  }

  setupEmbeddingDataPickerDecisionEndpoints("staged");

  setupSearchEndpoints([
    ...(hasModels ? createModelSearchResults() : []),
    ...(hasMetrics ? createMetricSearchResults() : []),
  ]);
  setupDatabasesEndpoints([createDatabase()]);

  const picker = (
    <EmbeddingDataPicker
      query={query}
      stageIndex={0}
      canChangeDatabase={true}
      hasMetrics={true}
      isDisabled={false}
      onChange={jest.fn()}
      title="Pick your starting data"
      placeholder="Pick your starting data"
      table={undefined}
    />
  );

  renderWithProviders(
    contextEntityTypes ? (
      <EmbeddingDataPickerContextProvider
        entityTypes={contextEntityTypes}
        dataPicker="staged"
      >
        {picker}
      </EmbeddingDataPickerContextProvider>
    ) : (
      picker
    ),
    {
      storeInitialState: createMockState({
        ...(settings && { settings }),
        ...(entityTypes && {
          embeddingDataPicker: createMockEmbeddingDataPickerState({
            entityTypes,
          }),
        }),
      }),
    },
  );
}

function createDatabase() {
  return createSampleDatabase({
    tables: [
      createOrdersTable(),
      createPeopleTable(),
      createProductsTable(),
      createReviewsTable(),
    ],
  });
}

function createModelSearchResults() {
  return [
    createMockModelResult({
      id: 1,
      name: "Orders model",
    }),
    createMockModelResult({
      id: 2,
      name: "People model",
    }),
  ];
}

function createMetricSearchResults() {
  return [
    createMockSearchResult({
      id: 3,
      name: "Revenue",
      model: "metric",
    }),
  ];
}

function createEmptyQuery(): Query {
  const question = Question.create();
  return question.query();
}
