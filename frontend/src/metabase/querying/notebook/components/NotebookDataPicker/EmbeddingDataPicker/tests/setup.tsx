import {
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEmbeddingDataPickerState } from "__support__/state/embedding-data-picker";
import { renderWithProviders } from "__support__/ui";
import type {
  EmbeddingDataPicker,
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

interface SetupOpts {
  hasModels?: boolean;
  hasMetrics?: boolean;
  dataPicker?: EmbeddingDataPicker;
  entityTypes?: EmbeddingEntityType[];
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
};

export function setup({
  hasModels = DEFAULT_OPTS.hasModels,
  hasMetrics = false,
  dataPicker = "staged",
  entityTypes,
}: SetupOpts = {}) {
  const query = createEmptyQuery();

  setupEmbeddingDataPickerDecisionEndpoints(dataPicker);

  setupSearchEndpoints([
    ...(hasModels ? createModelSearchResults() : []),
    ...(hasMetrics ? createMetricSearchResults() : []),
  ]);
  setupDatabasesEndpoints([createDatabase()]);

  renderWithProviders(
    <EmbeddingDataPicker
      query={query}
      stageIndex={0}
      canChangeDatabase={true}
      isDisabled={false}
      onChange={jest.fn()}
      title="Pick your starting data"
      placeholder="Pick your starting data"
      table={undefined}
    />,
    entityTypes
      ? {
          storeInitialState: createMockState({
            embeddingDataPicker: createMockEmbeddingDataPickerState({
              entityTypes,
            }),
          }),
        }
      : undefined,
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
