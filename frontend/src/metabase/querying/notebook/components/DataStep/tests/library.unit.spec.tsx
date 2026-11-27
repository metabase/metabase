import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionItemsEndpoint,
  setupLibraryEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { screen, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import Question from "metabase-lib/v1/Question";
import {
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../../test-utils";

import { setup } from "./setup";

// The library plugin stays initialized for the rest of the file, so it has a
// file of its own.
const LIBRARY_ID = 6464;

const LIBRARY_DATA = createMockCollectionItem({
  id: 6465,
  name: "Data",
  model: "collection",
  type: "library-data",
  is_library_root: true,
  here: ["table"],
});

const LIBRARY_METRICS = createMockCollectionItem({
  id: 6466,
  name: "Metrics",
  model: "collection",
  type: "library-metrics",
  is_library_root: true,
  here: ["metric"],
});

const PUBLISHED_ORDERS = createMockCollectionItem({
  id: ORDERS_ID,
  name: "Orders",
  model: "table",
  collection_id: LIBRARY_DATA.id,
  database_id: SAMPLE_DB_ID,
});

describe("DataStep > library", () => {
  mockGetBoundingClientRect();

  it("shows the library instead of the databases and collections in the mini picker (uxw-2403)", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupLibraryEndpoints({
      hasLibrary: true,
      library: { id: LIBRARY_ID, below: ["table", "metric"] },
    });
    setupCollectionItemsEndpoint({
      collection: { id: LIBRARY_ID },
      collectionItems: [LIBRARY_DATA, LIBRARY_METRICS],
    });
    setupCollectionItemsEndpoint({
      collection: { id: LIBRARY_DATA.id },
      collectionItems: [PUBLISHED_ORDERS],
    });
    const question = Question.create({
      metadata: createMockMetadata(),
      DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
    });
    await setup({
      step: createMockNotebookStep({ query: question.query() }),
      enterprisePlugins: ["library"],
    });

    const miniPicker = await screen.findByTestId("mini-picker");
    const libraryData = await within(miniPicker).findByText("Data");
    expect(within(miniPicker).getByText("Browse all")).toBeInTheDocument();
    expect(
      within(miniPicker).queryByText("Our analytics"),
    ).not.toBeInTheDocument();

    await userEvent.click(libraryData);
    expect(await within(miniPicker).findByText("Orders")).toBeInTheDocument();
  });
});
