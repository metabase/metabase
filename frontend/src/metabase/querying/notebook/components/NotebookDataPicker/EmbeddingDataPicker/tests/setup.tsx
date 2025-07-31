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
  modelCount: number;
  hasModels?: boolean;
  entityTypes?: EmbeddingEntityType[];
}

export function setup({
  hasModels = true,
  modelCount,
  entityTypes = [],
}: SetupOpts) {
  const query = createEmptyQuery();

  setupEmbeddingDataPickerDecisionEndpoints("staged");

  if (hasModels) {
    setupSearchEndpoints(createSearchResults(modelCount ?? 2));
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
    {
      storeInitialState: createMockState({
        embeddingDataPicker: { entityTypes },
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

function createSearchResults(modelCount = 2) {
  return Array.from({ length: modelCount }, (_, i) =>
    createMockModelResult({ id: i, name: `Model ${i + 1}` }),
  );
}

function createEmptyQuery(): Query {
  const question = Question.create();
  return question.query();
}
