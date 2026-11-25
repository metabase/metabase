import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNativeQuerySnippetEndpoints } from "__support__/server-mocks";
import { setupCardDashboardsEndpoint } from "__support__/server-mocks/card";
import { screen, within } from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, Database, Settings } from "metabase-types/api";
import {
  createMockCard,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  REVIEWS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing
// `trackSchemaEvent` outside analytics files.
const { trackSchemaEvent: mockTrackSchemaEvent } = jest.requireMock<{
  trackSchemaEvent: jest.Mock;
}>("metabase/analytics");

const QUERY_LIMIT = 2;
const REVIEWS_SQL = `SELECT "PUBLIC"."REVIEWS"."ID" FROM "PUBLIC"."REVIEWS" LIMIT ${QUERY_LIMIT}`;

const REVIEWS_QUERY = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: REVIEWS_ID }, limit: QUERY_LIMIT }],
  }),
);

const UNSAVED_REVIEWS_CARD = createMockUnsavedCard({
  dataset_query: REVIEWS_QUERY,
});

const SAVED_REVIEWS_CARD = createMockCard({
  id: 7,
  name: "Reviews question",
  dataset_query: REVIEWS_QUERY,
});

type NativeDatasetRequestBody = {
  stages?: { "source-table"?: number; limit?: number }[];
};

// Returns the SQL only for the query of the question in the notebook
function setupReviewsNativeDatasetEndpoint() {
  fetchMock.post("path:/api/dataset/native", (call) => {
    const body: NativeDatasetRequestBody = JSON.parse(
      String(call.options.body),
    );
    const stage = body.stages?.[0];
    const isReviewsQuery =
      stage?.["source-table"] === REVIEWS_ID && stage?.limit === QUERY_LIMIT;
    return isReviewsQuery
      ? { query: REVIEWS_SQL, params: null }
      : { status: 400, body: "Unexpected query" };
  });
}

interface SetupOpts {
  card?: Card | typeof UNSAVED_REVIEWS_CARD;
  database?: Database;
  settings?: Partial<Settings>;
}

async function setupNotebook({
  card = UNSAVED_REVIEWS_CARD,
  database = createSampleDatabase(),
  settings,
}: SetupOpts = {}) {
  setupReviewsNativeDatasetEndpoint();
  setupNativeQuerySnippetEndpoints();
  if ("id" in card) {
    setupCardDashboardsEndpoint(card.id, []);
  }
  const initialRoute =
    "id" in card
      ? `/question/${card.id}/notebook`
      : `/question/notebook#${serializeCardForUrl(card)}`;
  await setup({ card, database, initialRoute, settings });
  expect(await screen.findByTestId("data-step-cell")).toHaveTextContent(
    "Reviews",
  );
}

function getHeaderActions() {
  return screen.getByTestId("qb-header-action-panel");
}

describe("QueryBuilder > notebook > native query preview", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("toggles the preview sidebar and tracks when it is shown and hidden", async () => {
    await setupNotebook();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(getHeaderActions()).getByRole("switch", { name: "View SQL" }),
    );

    const sidebar = await screen.findByTestId("native-query-preview-sidebar");
    expect(within(sidebar).getByText("SQL for this question")).toBeVisible();
    expect(
      await within(sidebar).findByText(/LIMIT 2/, { exact: false }),
    ).toBeInTheDocument();
    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSchemaEvent).toHaveBeenLastCalledWith("question", {
      event: "notebook_native_preview_shown",
      question_id: 0,
    });

    await userEvent.click(
      within(getHeaderActions()).getByRole("switch", { name: "Hide SQL" }),
    );

    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackSchemaEvent).toHaveBeenLastCalledWith("question", {
      event: "notebook_native_preview_hidden",
      question_id: 0,
    });
  });

  it("tracks the id of a saved question", async () => {
    await setupNotebook({ card: SAVED_REVIEWS_CARD });

    await userEvent.click(
      within(getHeaderActions()).getByRole("switch", { name: "View SQL" }),
    );

    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeInTheDocument();
    expect(mockTrackSchemaEvent).toHaveBeenLastCalledWith("question", {
      event: "notebook_native_preview_shown",
      question_id: SAVED_REVIEWS_CARD.id,
    });
  });

  it("does not offer the preview to a user without native permissions", async () => {
    await setupNotebook({
      database: createSampleDatabase({ native_permissions: "none" }),
    });

    expect(
      within(getHeaderActions()).getByTestId("qb-save-button"),
    ).toBeVisible();
    expect(
      within(getHeaderActions()).queryByRole("switch", { name: /View SQL/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("View SQL")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("opens the preview sidebar at the width the user saved before", async () => {
    await setupNotebook({
      settings: { "notebook-native-preview-sidebar-width": 555 },
    });

    await userEvent.click(
      within(getHeaderActions()).getByRole("switch", { name: "View SQL" }),
    );

    const sidebar = await screen.findByTestId("native-query-preview-sidebar");
    // eslint-disable-next-line testing-library/no-node-access -- react-resizable sets the width on its own box, which has no role or label
    const resizableBox = sidebar.closest<HTMLElement>(".react-resizable");
    expect(resizableBox?.style.width).toBe("555px");
  });
});
