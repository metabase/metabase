import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryEndpoint,
  setupAdhocQueryMetadataEndpoint,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { createMockEntitiesState } from "metabase/metadata-store";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { CardType, CollectionItemModel } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockColumn,
  createMockDataset,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NewMetricPage } from "./NewMetricPage";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();

const CARD_TYPE_TO_MODEL = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const satisfies Record<CardType, CollectionItemModel>;
const ROOT = createMockCollection(ROOT_COLLECTION);

const ORDERS_QUESTION = createMockCard({
  id: 5,
  name: "Orders",
  type: "question",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
});

const ORDERS_MODEL = createMockCard({
  id: 10,
  name: "Orders Model",
  type: "model",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
});

const ORDERS_METRIC = createMockCard({
  id: 20,
  name: "Orders metric",
  type: "metric",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

function setup() {
  mockGetBoundingClientRect();
  setupDatabasesEndpoints([SAMPLE_DB]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupSearchEndpoints([]);
  setupCollectionsEndpoints({ collections: [ROOT] });
  setupCollectionByIdEndpoint({ collections: [ROOT] });
  setupCollectionItemsEndpoint({
    collection: ROOT,
    collectionItems: [ORDERS_QUESTION, ORDERS_MODEL, ORDERS_METRIC].map(
      (card) =>
        createMockCollectionItem({
          id: card.id,
          name: card.name,
          model: CARD_TYPE_TO_MODEL[card.type],
          collection_id: null,
          database_id: SAMPLE_DB_ID,
        }),
    ),
  });
  setupTableQueryMetadataEndpoint(createOrdersTable());
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardEndpoints(ORDERS_MODEL);
  setupCardQueryMetadataEndpoint(
    ORDERS_MODEL,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  // v65 loads the metadata of a picked card from its virtual table
  fetchMock.get(
    `path:/api/table/card__${ORDERS_MODEL.id}/query_metadata`,
    createMockTable({
      id: `card__${ORDERS_MODEL.id}`,
      db_id: SAMPLE_DB_ID,
      display_name: ORDERS_MODEL.name,
    }),
    { name: `card-${ORDERS_MODEL.id}-table-query-metadata` },
  );

  renderWithProviders(
    <Route path="/metric/new" element={<NewMetricPage />} />,
    { withRouter: true, initialRoute: "/metric/new" },
  );
}

async function pickFromMiniPicker(path: string[]) {
  const miniPicker = await screen.findByTestId("mini-picker");
  for (const name of path) {
    await userEvent.click(await within(miniPicker).findByText(name));
  }
}

function getRootItemsRequestModels() {
  return fetchMock.callHistory
    .calls("path:/api/collection/root/items")
    .map((call) => new URL(call.url).searchParams.getAll("models"));
}

function BrowseMetricsPage() {
  return <h1>Browse metrics page</h1>;
}

function setupFromBrowsePage() {
  setupDatabasesEndpoints([SAMPLE_DB]);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionByIdEndpoint({ collections: [ROOT] });
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );

  return renderWithProviders(
    <>
      <Route path="/browse/metrics" element={<BrowseMetricsPage />} />
      <Route path="/metric/new" element={<NewMetricPage />} />
    </>,
    {
      withRouter: true,
      initialRoute: "/browse/metrics",
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [SAMPLE_DB] }),
      }),
    },
  );
}

describe("NewMetricPage", () => {
  it("does not offer a new stage after the formula of a metric based on a model", async () => {
    setup();
    // The source and its Count load only after the card metadata arrives.
    fetchMock.modifyRoute(`card-${ORDERS_MODEL.id}-table-query-metadata`, {
      delay: 750,
    });

    await pickFromMiniPicker(["Our analytics", "Orders Model"]);

    const dataStep = await screen.findByTestId("step-data-0-0");
    expect(
      await within(dataStep).findByText("Orders Model"),
    ).toBeInTheDocument();
    const summarizeStep = await screen.findByTestId("step-summarize-0-0");
    expect(await within(summarizeStep).findByText("Count")).toBeInTheDocument();
    ["Join data", "Custom column"].forEach((name) => {
      expect(
        within(dataStep).getByRole("button", { name }),
      ).toBeInTheDocument();
      expect(
        within(summarizeStep).queryByRole("button", { name }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Summarize" }),
    ).not.toBeInTheDocument();
  });

  it("lists metrics when picking the data source", async () => {
    setup();

    await pickFromMiniPicker(["Browse all"]);
    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Our analytics"));

    expect(await within(modal).findByText("Orders metric")).toBeInTheDocument();
    expect(getRootItemsRequestModels()).toContainEqual(
      expect.arrayContaining(["metric"]),
    );
  });

  it("does not list metrics when joining data", async () => {
    setup();
    await pickFromMiniPicker(["Sample Database", "Orders"]);

    const dataStep = await screen.findByTestId("step-data-0-0");
    await userEvent.click(
      within(dataStep).getByRole("button", { name: "Join data" }),
    );
    await pickFromMiniPicker(["Our analytics"]);
    const miniPicker = screen.getByTestId("mini-picker");
    expect(await within(miniPicker).findByText("Orders")).toBeInTheDocument();
    expect(within(miniPicker).getByText("Orders Model")).toBeInTheDocument();
    expect(
      within(miniPicker).queryByText("Orders metric"),
    ).not.toBeInTheDocument();

    await pickFromMiniPicker(["Our analytics", "Browse all"]);
    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Our analytics"));
    expect(await within(modal).findByText("Orders")).toBeInTheDocument();
    expect(within(modal).getByText("Orders Model")).toBeInTheDocument();
    expect(within(modal).queryByText("Orders metric")).not.toBeInTheDocument();

    const requestedModels = getRootItemsRequestModels();
    expect(requestedModels).not.toHaveLength(0);
    requestedModels.forEach((models) => {
      expect(models).toEqual(expect.arrayContaining(["card", "dataset"]));
      expect(models).not.toContain("metric");
    });
  });

  it("runs the query from the empty state", async () => {
    setupAdhocQueryEndpoint(
      createMockDataset({
        data: {
          rows: [[18760]],
          cols: [
            createMockColumn({
              name: "count",
              display_name: "Count",
              base_type: "type/BigInteger",
              semantic_type: "type/Quantity",
              source: "aggregation",
            }),
          ],
        },
      }),
      {
        body: {
          database: SAMPLE_DB_ID,
          stages: [{ "source-table": ORDERS_ID, aggregation: [["count"]] }],
        },
        matchPartialBody: true,
      },
    );
    setup();
    await pickFromMiniPicker(["Sample Database", "Orders"]);

    await userEvent.click(
      within(await screen.findByTestId("run-button-overlay")).getByTestId(
        "run-button",
      ),
    );

    expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
      "18,760",
    );
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1);
  });

  describe("cancel", () => {
    const originalScrollBy = HTMLElement.prototype.scrollBy;

    beforeEach(() => {
      // The mini picker lists items with @tanstack/react-virtual, which renders
      // nothing in jsdom without element sizes and scrollBy.
      mockGetBoundingClientRect({ width: 1, height: 1 });
      HTMLElement.prototype.scrollBy = jest.fn();
    });

    afterEach(() => {
      HTMLElement.prototype.scrollBy = originalScrollBy;
      jest.restoreAllMocks();
    });

    it("asks to discard a new metric on cancel and goes back to the metrics page (metabase#48024)", async () => {
      const { router } = setupFromBrowsePage();

      await screen.findByRole("heading", { name: "Browse metrics page" });
      act(() => {
        router?.navigate("/metric/new");
      });
      const editor = await screen.findByTestId("metric-query-editor");

      const miniPicker = await screen.findByTestId("mini-picker");
      await userEvent.click(
        await within(miniPicker).findByText("Sample Database"),
      );
      await userEvent.click(await within(miniPicker).findByText("Orders"));
      await waitFor(() =>
        expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument(),
      );
      expect(within(editor).getByText("Orders")).toBeInTheDocument();

      await userEvent.click(
        within(editor).getByRole("button", { name: "Cancel" }),
      );
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByText("Discard your changes?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Discard changes" }),
      );

      expect(
        await screen.findByRole("heading", { name: "Browse metrics page" }),
      ).toBeInTheDocument();
      expect(router?.location.pathname).toBe("/browse/metrics");
      expect(
        screen.queryByTestId("metric-query-editor"),
      ).not.toBeInTheDocument();
    });
  });
});
