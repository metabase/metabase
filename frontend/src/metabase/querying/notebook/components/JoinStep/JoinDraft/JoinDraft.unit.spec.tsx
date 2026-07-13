import _userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import { createMockCollection } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NotebookProvider } from "../../Notebook/context";

import { JoinDraft } from "./JoinDraft";

const SAMPLE_DATABASE = createSampleDatabase();
const DATABASES = [SAMPLE_DATABASE];

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our Analytics",
});

const STATE = createMockState({
  entities: createMockEntitiesState({ databases: DATABASES }),
});

const metadata = createMockMetadata({ databases: DATABASES });
const provider = createMetadataProvider({ metadata });

const userEvent = _userEvent.setup();

function createQuery(tableId: number) {
  return Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: tableId } }],
  });
}

function renderJoinDraft(query: Lib.Query) {
  return (
    <NotebookProvider>
      <JoinDraft
        query={query}
        stageIndex={0}
        color="brand"
        isReadOnly={false}
        onJoinChange={jest.fn()}
      />
    </NotebookProvider>
  );
}

function setup(query: Lib.Query) {
  setupDatabasesEndpoints(DATABASES);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionByIdEndpoint({ collections: [ROOT_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [],
  });

  const { rerender } = renderWithProviders(renderJoinDraft(query), {
    storeInitialState: STATE,
  });

  return {
    rerender: (nextQuery: Lib.Query) => rerender(renderJoinDraft(nextQuery)),
  };
}

async function pickRightTable(tableName: string) {
  await userEvent.click(
    within(screen.getByLabelText("Right table")).getByRole("textbox"),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Browse all/ }),
  );
  const modal = await screen.findByTestId("entity-picker-modal");
  await waitForLoaderToBeRemoved();
  await userEvent.click(await within(modal).findByText("Databases"));
  await userEvent.click(await screen.findByText(/Sample Database/));
  await userEvent.click(await within(modal).findByText(tableName));
}

describe("JoinDraft", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // Guards metabase#42385: when the query's data source changes (e.g. the
  // notebook data step switches to a different database), the in-progress draft
  // join clause must be discarded so no stale/invalid condition lingers.
  it("should reset the draft join clause when the query data source changes (metabase#42385)", async () => {
    const { rerender } = setup(createQuery(ORDERS_ID));

    // Build up a draft join: pick a right table that has no suggested
    // conditions, so the draft stays open with an empty condition.
    await pickRightTable("Reviews");

    const rightTable = screen.getByLabelText("Right table");
    expect(await within(rightTable).findByText("Reviews")).toBeInTheDocument();
    expect(screen.getByLabelText("Left column")).toBeInTheDocument();
    expect(screen.getByLabelText("Right column")).toBeInTheDocument();

    // Change the query's data source (as switching databases in the data step
    // does). The draft must be cleared: the previously picked right table and
    // its (empty) join condition disappear.
    rerender(createQuery(PRODUCTS_ID));

    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Right table")).queryByText("Reviews"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Left column")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Right column")).not.toBeInTheDocument();
  });
});
