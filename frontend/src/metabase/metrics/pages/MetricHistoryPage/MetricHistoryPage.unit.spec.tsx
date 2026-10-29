import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupEntityRevisionsEndpoint,
  setupMetricEndpoint,
  setupRevertRevisionEndpoint,
} from "__support__/server-mocks";
import { setupAuditInfoEndpoint } from "__support__/server-mocks/audit";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDataset,
  createMockMetric,
  createMockRevision,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricHistoryPage } from "./MetricHistoryPage";

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;

const CREATED = createMockRevision({
  id: 1,
  description: "created this",
  timestamp: "2026-05-14T10:00:00Z",
});
const RENAMED = createMockRevision({
  id: 2,
  description: "renamed it",
  timestamp: "2026-05-16T10:00:00Z",
  is_creation: false,
});

function setup() {
  const card = createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Count of Orders",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    },
  });
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(card, createMockDataset());
  setupMetricEndpoint(createMockMetric({ id: card.id, name: card.name }));
  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  setupAuditInfoEndpoint({ auditInfo: {} });
  setupEntityRevisionsEndpoint("card", card.id, [RENAMED, CREATED]);
  setupRevertRevisionEndpoint(CREATED);

  renderWithProviders(
    <Route path="/metric/:cardId/history" element={<MetricHistoryPage />} />,
    { withRouter: true, initialRoute: `/metric/${CARD_ID}/history` },
  );
}

describe("MetricHistoryPage", () => {
  it("lists the metric's revisions newest first and reverts to an older one", async () => {
    setup();

    const list = await screen.findByTestId("saved-question-history-list");
    const events = within(list).getAllByTestId("revision-history-event");
    expect(events[0]).toHaveTextContent("renamed it");
    expect(events[1]).toHaveTextContent("created this");

    await userEvent.click(within(list).getByTestId("question-revert-button"));

    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/revision/revert")).toBe(
        true,
      ),
    );
    const call = fetchMock.callHistory.lastCall("path:/api/revision/revert");
    expect(await call?.request?.json()).toEqual({
      entity: "card",
      id: CARD_ID,
      revision_id: CREATED.id,
    });
  });
});
