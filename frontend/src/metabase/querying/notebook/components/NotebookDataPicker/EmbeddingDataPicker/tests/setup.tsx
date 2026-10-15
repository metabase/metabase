import { configureStore } from "@reduxjs/toolkit";

import {
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
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
  createMockModelResult,
  createMockSearchResult,
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
  entityTypes?: EmbeddingEntityType[];
  dataPicker?: EmbeddingDataPickerVariant;
  isJoinStep?: boolean;
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
};

export function setup({
  embeddingType,
  hasModels = DEFAULT_OPTS.hasModels,
  hasMetrics = false,
  entityTypes,
  dataPicker = "staged",
  isJoinStep = false,
}: SetupOpts) {
  const query = createEmptyQuery();

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
    embeddingType === "full-app" && entityTypes
      ? {
          storeInitialState: createMockState({
            embeddingDataPicker:
              getFullAppEmbeddingDataPickerState(entityTypes),
          }),
        }
      : undefined,
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
