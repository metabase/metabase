import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import type { Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { QuestionPicker } from "./QuestionPicker";

interface SetupOpts {
  dbs: Database[];
}

const DB_WITH_ONLY_DATA_ACCESS = createMockDatabase({
  id: 1,
  native_permissions: "none",
});

const DB_WITH_NATIVE_WRITE_ACCESS = createMockDatabase({
  id: 1,
  native_permissions: "write",
});

const DB_WITH_NO_WRITE_ACCESS = createMockDatabase({
  id: 1,
  is_saved_questions: true,
  native_permissions: "none",
});

const MOCK_ROOT_COLLECTION = createMockCollection(ROOT_COLLECTION);
const MOCK_COLLECTION = createMockCollection();

async function setup({ dbs }: SetupOpts) {
  setupDatabasesEndpoints(dbs);
  setupCollectionsEndpoints({
    collections: [MOCK_ROOT_COLLECTION, MOCK_COLLECTION],
  });
  setupCollectionByIdEndpoint({
    collections: [MOCK_ROOT_COLLECTION, MOCK_COLLECTION],
  });
  setupCollectionItemsEndpoint({
    collection: MOCK_ROOT_COLLECTION,
    collectionItems: [],
  });

  renderWithProviders(<QuestionPicker onSelect={jest.fn()} />);
}

describe("QuestionPicker", () => {
  describe("new buttons", () => {
    it("displays the 'New Question' button if the user has data access", async () => {
      await setup({ dbs: [DB_WITH_ONLY_DATA_ACCESS] });
      expect(await screen.findByText("New Question")).toBeInTheDocument();
      expect(screen.queryByText("New SQL query")).not.toBeInTheDocument();
    });

    it("displays the 'New Question' and 'New SQL query' button if the user has native write access", async () => {
      await setup({ dbs: [DB_WITH_NATIVE_WRITE_ACCESS] });
      expect(await screen.findByTestId("new-button-bar")).toBeInTheDocument();
      expect(await screen.findByText("New Question")).toBeInTheDocument();
      expect(await screen.findByText("New SQL query")).toBeInTheDocument();
    });

    it("does not display any buttons if the user has no access to either", async () => {
      await setup({ dbs: [DB_WITH_NO_WRITE_ACCESS] });
      expect(await screen.findByPlaceholderText(/Search/)).toBeInTheDocument();
      expect(screen.queryByText("New Question")).not.toBeInTheDocument();
      expect(screen.queryByText("New SQL query")).not.toBeInTheDocument();
    });
  });
});
