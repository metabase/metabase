import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import type { EmbeddingEntityType } from "metabase/embedding-sdk/store";
import type { Query } from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockEmbedOptions,
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

import { EmbeddingDataPicker } from "../EmbeddingDataPicker";

interface SetupOpts {
  hasModels?: boolean;
  entityTypes?: EmbeddingEntityType[];
}

const DEFAULT_OPTS: Partial<SetupOpts> = {
  hasModels: true,
};

export function setup({
  hasModels = DEFAULT_OPTS.hasModels,
  entityTypes,
}: SetupOpts = {}) {
  const query = createEmptyQuery();

  fetchMock.get(
    {
      name: "entity-count",
      url: "path:/api/search",
      query: {
        models: ["dataset", "table"],
        limit: 0,
      },
    },
    {
      total: 100,
    },
  );

  if (hasModels) {
    setupSearchEndpoints(createSearchResults());
  } else {
    setupSearchEndpoints([]);
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
    entityTypes
      ? {
          storeInitialState: createMockState({
            embed: createMockEmbedState({
              options: createMockEmbedOptions({
                entity_types: entityTypes,
              }),
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

function createSearchResults() {
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

function createEmptyQuery(): Query {
  const question = Question.create();
  return question.query();
}
