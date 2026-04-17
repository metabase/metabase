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
import { createMockEmbeddingDataPickerState } from "metabase-types/store/mocks/embedding-data-picker";

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

  setupEmbeddingDataPickerDecisionEndpoints("staged");

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
