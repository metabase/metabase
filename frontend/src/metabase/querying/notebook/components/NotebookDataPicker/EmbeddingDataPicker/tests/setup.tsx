import { configureStore } from "@reduxjs/toolkit";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupLibraryEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { embed, setInitialUrlOptions } from "metabase/redux/embed";
import { reducer as embeddingDataPickerReducer } from "metabase/redux/embedding-data-picker";
import type {
  EmbeddingDataPicker as EmbeddingDataPickerVariant,
  EmbeddingEntityType,
} from "metabase/redux/store/embedding-data-picker";
import type { Query } from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createMockCollection,
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
  embeddingType: "full-app" | "modular";
  hasModels?: boolean;
  hasMetrics?: boolean;
  hasLibrary?: boolean;
  entityTypes?: EmbeddingEntityType[];
  dataPicker?: EmbeddingDataPickerVariant;
  isJoinStep?: boolean;
  hasNestedQueriesEnabled?: boolean;
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
};

export function setup({
  embeddingType,
  hasModels = DEFAULT_OPTS.hasModels,
  hasMetrics = false,
  hasLibrary = false,
  entityTypes,
  dataPicker = "staged",
  isJoinStep = false,
  hasNestedQueriesEnabled = true,
}: SetupOpts) {
  const query = createEmptyQuery();

  // `mockSettings` has to run first, as the Library plugin reads the token
  // features when it initializes.
  const settings = mockSettings({
    "enable-nested-queries": hasNestedQueriesEnabled,
    ...(hasLibrary && {
      "token-features": createMockTokenFeatures({ library: true }),
    }),
  });
  if (hasLibrary) {
    setupEnterpriseOnlyPlugin("library");
  }
  setupLibraryEndpoints({
    hasLibrary,
    library: { below: createLibraryCollection().below },
  });
  setupCollectionsEndpoints({
    collections: hasLibrary ? [createLibraryCollection()] : [],
  });

  setupEmbeddingDataPickerDecisionEndpoints(dataPicker);

  setupSearchEndpoints([
    ...(hasModels ? createModelSearchResults() : []),
    ...(hasMetrics ? createMetricSearchResults() : []),
  ]);
  setupDatabasesEndpoints([createDatabase()]);

  const picker = (
    <EmbeddingDataPicker
      query={query}
      stageIndex={0}
      canChangeDatabase={!isJoinStep}
      isDisabled={false}
      onChange={jest.fn()}
      title="Pick your starting data"
      placeholder="Pick your starting data"
      table={undefined}
    />
  );

  renderWithProviders(
    embeddingType === "modular" ? (
      <EmbeddingDataPickerContextProvider
        entityTypes={entityTypes}
        dataPicker="staged"
      >
        {picker}
      </EmbeddingDataPickerContextProvider>
    ) : (
      picker
    ),
    {
      storeInitialState: createMockState({
        settings,
        ...(embeddingType === "full-app" &&
          entityTypes && {
            embeddingDataPicker:
              getFullAppEmbeddingDataPickerState(entityTypes),
          }),
      }),
    },
  );
}

// Full-app embedding takes `entity_types` from the URL, so this runs the real
// entry point and its allowlist instead of writing the state directly
function getFullAppEmbeddingDataPickerState(
  entityTypes: EmbeddingEntityType[],
) {
  const store = configureStore({
    reducer: { embeddingDataPicker: embeddingDataPickerReducer, embed },
  });
  const search = new URLSearchParams(
    entityTypes.map((entityType) => ["entity_types", entityType]),
  ).toString();
  store.dispatch(setInitialUrlOptions({ search }));
  return store.getState().embeddingDataPicker;
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

function createLibraryCollection() {
  return createMockCollection({
    id: 6464,
    name: "Library",
    type: "library",
    here: ["collection"],
    below: ["table", "metric"],
    children: [
      createMockCollection({
        id: 6465,
        name: "Data",
        type: "library-data",
        here: ["table"],
      }),
      createMockCollection({
        id: 6466,
        name: "Metrics",
        type: "library-metrics",
        here: ["metric"],
      }),
    ],
  });
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
