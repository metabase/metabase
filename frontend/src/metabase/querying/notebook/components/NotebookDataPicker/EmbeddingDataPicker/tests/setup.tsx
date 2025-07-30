import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import type { Query } from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingDataPicker } from "../EmbeddingDataPicker";

interface SetupOpts {
  hasModels?: boolean;
  modelCount?: number;
  entityTypes?: EmbeddingEntityType[];
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
  modelCount: 2,
};

export function setup({
  hasModels = DEFAULT_OPTS.hasModels,
  modelCount = DEFAULT_OPTS.modelCount,
  entityTypes,
}: SetupOpts = {}) {
  const query = createEmptyQuery();

  setupEmbeddingDataPickerDecisionEndpoints("staged");

  if (hasModels) {
    // Mock the specific model count query made by EmbeddingDataPicker
    const modelResults = createMockSearchResults(modelCount ?? 2);
    setupSearchEndpoints(modelResults);

    fetchMock.get(
      {
        url: "path:/api/search",
        query: { models: "dataset", limit: "0" },
      },
      {
        data: modelResults,
        total: modelResults.length,
        models: ["dataset"],
        available_models: ["dataset"],
        limit: 0,
        offset: 0,
      },
      { overwriteRoutes: false },
    );
  } else {
    setupSearchEndpoints([]);

    // Mock empty model count query
    fetchMock.get(
      {
        url: "path:/api/search",
        query: { models: "dataset", limit: "0" },
      },
      {
        data: [],
        total: 0,
        models: ["dataset"],
        available_models: [],
        limit: 0,
        offset: 0,
      },
      { overwriteRoutes: false },
    );
  }
  setupDatabasesEndpoints([createDatabase()]);

  renderWithProviders(
    <EmbeddingDataPicker
      query={query}
      stageIndex={0}
      canChangeDatabase={true}
      isDisabled={false}
      onChange={jest.fn()}
      placeholder="Pick your starting data"
      table={undefined}
    />,
    {
      storeInitialState: createMockState({
        embeddingDataPicker: {
          entityTypes: entityTypes || [], // Use empty array to indicate "use defaults"
        },
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

function createMockSearchResults(modelCount: number = 2) {
  return Array.from({ length: modelCount }, (_, i) =>
    createMockModelResult({ id: i, name: `Model ${i + 1}` }),
  );
}

function createEmptyQuery(): Query {
  const question = Question.create();
  return question.query();
}
