import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import { createQuery } from "metabase-lib/test-helpers";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { EmbeddingDataPicker } from "./EmbeddingDataPicker";

function setup() {
  const metadata = createMetadata();
  const query = createQuery({ metadata });
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
  setupSearchEndpoints(createSearchResults());
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
  );
}

describe("EmbeddingDataPicker", () => {
  describe("multi-stage data picker", () => {
    it("should render", async () => {
      setup();

      expect(await screen.findByText("Sample Database")).toBeInTheDocument();
    });
  });
});

function createMetadata() {
  return createMockMetadata({
    databases: [createDatabase()],
  });
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
      name: "Orders",
    }),
    createMockModelResult({
      id: 2,
      name: "People",
    }),
    createMockModelResult({
      id: 3,
      name: "Products",
    }),
    createMockModelResult({
      id: 4,
      name: "Reviews",
    }),
  ];
}
