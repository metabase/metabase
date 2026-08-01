import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockRemoteSyncWorktree,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useContentStudioScope } from "../scope";
import { setupContentStudio } from "../tests/setup";

import { ContentStudioQuestionPage } from "./ContentStudioQuestionPage";

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  can_write: true,
  worktree_id: WORKTREE.id,
});

const ORDERS_QUERY = createMockStructuredDatasetQuery({
  database: SAMPLE_DB_ID,
  query: { "source-table": ORDERS_ID },
});

const BRANCH_CARD = createMockCard({
  id: 7,
  name: "Revenue",
  type: "question",
  can_write: true,
  collection_id: BRANCH_COLLECTION.id,
  worktree_id: WORKTREE.id,
  dataset_query: ORDERS_QUERY,
});

const NATIVE_BRANCH_CARD = createMockCard({
  ...BRANCH_CARD,
  id: 8,
  name: "Raw orders",
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
    native: { query: "select * from orders" },
  }),
});

const MODEL_BRANCH_CARD = createMockCard({
  ...BRANCH_CARD,
  id: 10,
  name: "Orders model",
  type: "model",
  display: "table",
});

// The stored `display` is deliberately not the one the query dictates, so a save
// that echoes it back rather than deriving one is visible.
const METRIC_BRANCH_CARD = createMockCard({
  ...BRANCH_CARD,
  id: 9,
  name: "Order count",
  type: "metric",
  display: "table",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
  }),
});

function ScopeProbe() {
  const { worktreeId } = useContentStudioScope();
  return <div data-testid="current-scope">{worktreeId ?? "main"}</div>;
}

type SetupOpts = {
  card?: Card;
};

function setup({ card = BRANCH_CARD }: SetupOpts = {}) {
  mockGetBoundingClientRect();

  setupDatabasesEndpoints([createSampleDatabase()]);
  setupCardsEndpoints([card]);
  const queryMetadata = createMockCardQueryMetadata({
    databases: [createSampleDatabase()],
  });
  setupCardQueryMetadataEndpoint(card, queryMetadata);
  setupAdhocQueryMetadataEndpoint(queryMetadata);
  setupCollectionsEndpoints({ collections: [BRANCH_COLLECTION] });
  setupCollectionByIdEndpoint({ collections: [BRANCH_COLLECTION] });
  setupRecentViewsAndSelectionsEndpoints([]);
  setupSearchEndpoints([]);
  setupNativeQuerySnippetEndpoints();
  setupUserMetabotPermissionsEndpoint();

  setupContentStudio({
    routes: (
      <Route path="question/:cardId" element={<ContentStudioQuestionPage />} />
    ),
    chrome: <ScopeProbe />,
    initialRoute: `/content-studio/question/${card.id}`,
    worktrees: [WORKTREE],
  });
}

describe("ContentStudioQuestionPage", () => {
  afterEach(() => {
    reinitialize();
  });

  it("renders the card inside Content Studio chrome", async () => {
    setup();

    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Analytics" }),
    ).toHaveAttribute("href", "/content-studio/collection/11-analytics");
  });

  it("shows the card's query in an editable notebook", async () => {
    setup();

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(await screen.findByTestId("action-buttons")).toBeInTheDocument();
  });

  it("saves an edited native query onto the same card", async () => {
    setup({ card: NATIVE_BRANCH_CARD });

    const editor = await screen.findByTestId("mock-native-query-editor");
    const input = within(editor).getByRole("textbox");
    expect(input).toHaveValue("select * from orders");

    await userEvent.clear(input);
    await userEvent.type(input, "select 1");

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${NATIVE_BRANCH_CARD.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls(
      `path:/api/card/${NATIVE_BRANCH_CARD.id}`,
      { method: "PUT" },
    );
    expect(String(call.options.body)).toContain("select 1");
  });

  it("scopes the studio to the branch the card lives on", async () => {
    setup();

    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(await screen.findByTestId("current-scope")).toHaveTextContent("5");
  });

  it("saves an edited query onto the same card", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Row limit" }),
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Enter a limit"),
      "5",
    );
    await userEvent.tab();

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${BRANCH_CARD.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls(
      `path:/api/card/${BRANCH_CARD.id}`,
      { method: "PUT" },
    );
    expect(JSON.parse(String(call.options.body))).toMatchObject({
      dataset_query: { stages: [{ "source-table": ORDERS_ID, limit: 5 }] },
    });
  });

  it("saves an edited model without rewriting its visualization", async () => {
    setup({ card: MODEL_BRANCH_CARD });

    expect(await screen.findByText("Orders model")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "Row limit" }),
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Enter a limit"),
      "5",
    );
    await userEvent.tab();

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${MODEL_BRANCH_CARD.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls(
      `path:/api/card/${MODEL_BRANCH_CARD.id}`,
      { method: "PUT" },
    );
    const body = JSON.parse(String(call.options.body));
    expect(body).toMatchObject({
      dataset_query: { stages: [{ "source-table": ORDERS_ID, limit: 5 }] },
    });
    expect(body).not.toHaveProperty("display");
    expect(body).not.toHaveProperty("visualization_settings");
  });

  describe("metrics", () => {
    it("shows the metric's aggregation in an editable notebook", async () => {
      setup({ card: METRIC_BRANCH_CARD });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(await screen.findByText("Count")).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Filter" }),
      ).toBeInTheDocument();
    });

    it("saves an edited aggregation onto the same metric", async () => {
      setup({ card: METRIC_BRANCH_CARD });

      await userEvent.click(await screen.findByText("Count"));
      await userEvent.click(
        await screen.findByText("Cumulative count of rows"),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: "Save" }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(
            `path:/api/card/${METRIC_BRANCH_CARD.id}`,
            { method: "PUT" },
          ),
        ).toHaveLength(1);
      });

      const [call] = fetchMock.callHistory.calls(
        `path:/api/card/${METRIC_BRANCH_CARD.id}`,
        { method: "PUT" },
      );
      expect(JSON.parse(String(call.options.body))).toMatchObject({
        dataset_query: {
          stages: [
            {
              "source-table": ORDERS_ID,
              aggregation: [["cum-count", expect.anything()]],
            },
          ],
        },
        // A metric has no user-chosen visualization, so its query dictates one.
        display: "scalar",
      });
    });

    it("keeps a metric the user cannot write read-only", async () => {
      setup({
        card: createMockCard({ ...METRIC_BRANCH_CARD, can_write: false }),
      });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Filter" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps a card the user cannot write read-only", async () => {
    setup({ card: createMockCard({ ...BRANCH_CARD, can_write: false }) });

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.queryByTestId("action-buttons")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });
});
