import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";

import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardQueryEndpoints,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupFieldValuesEndpoints,
  setupModelIndexEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
  setupPropertiesEndpoints,
  setupRecentViewsEndpoints,
  setupCardQueryMetadataEndpoint,
  setupAdhocQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import NewItemMenu from "metabase/containers/NewItemMenu";
import { LOAD_COMPLETE_FAVICON } from "metabase/hoc/Favicon";
import { serializeCardForUrl } from "metabase/lib/card";
import { checkNotNull } from "metabase/lib/types";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import type { Card, Dataset, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockFieldValues,
  createMockModelIndex,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockResultsMetadata,
  createMockSettings,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import type { RequestState, State } from "metabase-types/store";

import QueryBuilder from "./QueryBuilder";

export const TEST_DB = createSampleDatabase();

export const TEST_CARD = createMockCard({
  id: 1,
  name: "Test card",
  type: "model",
});

export const TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD = createMockCard({
  ...TEST_CARD,
  type: "question",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, null]],
    },
  },
});

export const TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD = createMockCard({
  ...TEST_CARD,
  type: "question",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["expression", "Custom Created At"]],
      expressions: {
        "Custom Created At": ["field", ORDERS.CREATED_AT, null],
      },
    },
  },
});

export const TEST_CARD_VISUALIZATION = createMockCard({
  ...TEST_CARD,
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
    },
  },
});

export const TEST_MODEL_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      limit: 1,
    },
  },
  type: "model",
  display: "scalar",
  description: "Test description",
});

export const TEST_MODEL_CARD_SLUG = [
  TEST_MODEL_CARD.id,
  TEST_MODEL_CARD.name.toLowerCase(),
].join("-");

export const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
    native: createMockNativeQuery({
      query: "SELECT 1",
    }),
  }),
});

export const TEST_NATIVE_CARD_DATASET = createMockDataset({
  json_query: {
    database: SAMPLE_DB_ID,
    type: "native",
    native: {
      query: "SELECT 1",
    },
  },
  database_id: SAMPLE_DB_ID,
  status: "completed",
  row_count: 1,
  running_time: 35,
});

export const TEST_UNSAVED_NATIVE_CARD = createMockUnsavedCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

export const TEST_STRUCTURED_CARD = createMockCard({
  name: "Orders question",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": ORDERS_ID,
      limit: 1,
    }),
  }),
});

export const TEST_UNSAVED_STRUCTURED_CARD = createMockUnsavedCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": ORDERS_ID,
    }),
  }),
});

export const TEST_MODEL_DATASET_COLUMN = createMockColumn({
  name: "ID",
  source: "fields",
  display_name: "ID",
  description: "test",
  field_ref: ["field", ORDERS.ID, null],
});

export const TEST_MODEL_DATASET = createMockDataset({
  data: {
    rows: [["1"]],
    cols: [TEST_MODEL_DATASET_COLUMN],
  },
  database_id: SAMPLE_DB_ID,
  status: "completed",
  context: "question",
  row_count: 1,
  running_time: 35,
});

export const TEST_COLLECTION = createMockCollection();

export const TEST_METADATA = createMockResultsMetadata();

const TestQueryBuilder = (
  props: ComponentPropsWithoutRef<typeof QueryBuilder>,
) => {
  return (
    <div>
      <link rel="icon" />
      <QueryBuilder {...props} />
    </div>
  );
};

const TestHome = () => <NewItemMenu trigger={<button>New</button>} />;

const TestRedirect = () => <div />;

const isSavedCard = (card: Card | UnsavedCard | null): card is Card => {
  return card !== null && "id" in card;
};

interface SetupOpts {
  card: Card | UnsavedCard | null;
  dataset?: Dataset;
  initialRoute?: string;
}

export const setup = async ({
  card,
  dataset = createMockDataset(),
  initialRoute = `/question${
    isSavedCard(card) ? `/${card.id}` : `#${serializeCardForUrl(card)}`
  }`,
}: SetupOpts) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardDataset(dataset);
  setupSearchEndpoints([]);
  setupPropertiesEndpoints(createMockSettings());
  setupCollectionsEndpoints({ collections: [] });
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
  setupFieldValuesEndpoints(
    createMockFieldValues({ field_id: Number(ORDERS.QUANTITY) }),
  );
  setupRecentViewsEndpoints([]);

  const metadata = createMockCardQueryMetadata({ databases: [TEST_DB] });
  setupAdhocQueryMetadataEndpoint(metadata);

  if (isSavedCard(card)) {
    setupCardsEndpoints([card]);
    setupCardQueryMetadataEndpoint(card, metadata);
    setupCardQueryEndpoints(card, dataset);
    setupAlertsEndpoints(card, []);
    setupModelIndexEndpoints(card.id, []);
  }

  if (card === null) {
    fetchMock.get("path:/api/model-index", [createMockModelIndex()]);
  }

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const {
    store: { getState },
    container,
    history,
  } = renderWithProviders(
    <Route>
      <Route path="/" component={TestHome} />
      <Route path="/model">
        <Route path="new" component={NewModelOptions} />
        <Route path="query" component={TestQueryBuilder} />
        <Route path="metadata" component={TestQueryBuilder} />
        <Route path="notebook" component={TestQueryBuilder} />
        <Route path=":slug/query" component={TestQueryBuilder} />
        <Route path=":slug/metadata" component={TestQueryBuilder} />
        <Route path=":slug/notebook" component={TestQueryBuilder} />
      </Route>
      <Route path="/question">
        <IndexRoute component={TestQueryBuilder} />
        <Route path="notebook" component={TestQueryBuilder} />
        <Route path=":slug" component={TestQueryBuilder} />
        <Route path=":slug/notebook" component={TestQueryBuilder} />
      </Route>
      <Route path="/redirect" component={TestRedirect} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForLoadingRequests(getState);
  await waitForLoaderToBeRemoved();
  await waitForLoadingRequests(getState);

  return {
    container,
    history: checkNotNull(history),
    mockEventListener,
  };
};

const waitForLoadingRequests = async (getState: () => State) => {
  await waitFor(
    () => {
      const requests = getRequests(getState());
      const areRequestsLoading = requests.some(request => request.loading);
      expect(areRequestsLoading).toBe(false);
    },
    { timeout: 5000 },
  );
};

const getRequests = (state: State): RequestState[] => {
  return Object.values(state.requests).flatMap(group =>
    Object.values(group).flatMap(entity =>
      Object.values(entity).flatMap(request => Object.values(request)),
    ),
  );
};

export const startNewNotebookModel = async () => {
  await userEvent.click(screen.getByText("Use the notebook editor"));
  await waitForLoaderToBeRemoved();

  const modal = await screen.findByTestId("entity-picker-modal");
  await waitForLoaderToBeRemoved();
  await userEvent.click(await within(modal).findByText("Orders"));

  expect(screen.getByRole("button", { name: "Get Answer" })).toBeEnabled();
};

export const triggerNativeQueryChange = async () => {
  await waitForNativeQueryEditorReady();

  const inputArea = within(
    screen.getByTestId("mock-native-query-editor"),
  ).getByRole("textbox");

  await userEvent.click(inputArea);
  await userEvent.type(inputArea, "0");
  await userEvent.tab();
};

export const triggerMetadataChange = async () => {
  await waitFor(() => {
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  });

  const columnDisplayName = screen.getByLabelText("Display name");

  await userEvent.click(columnDisplayName);
  await userEvent.type(columnDisplayName, "X");
  await userEvent.tab();
};

export const triggerVisualizationQueryChange = async () => {
  await userEvent.click(screen.getByText("Filter"));

  const modal = screen.getByRole("dialog");
  const total = within(modal).getByTestId("filter-column-Total");
  const maxInput = within(total).getByPlaceholderText("Max");
  await userEvent.type(maxInput, "1000");
  await userEvent.tab();

  await userEvent.click(screen.getByTestId("apply-filters"));
};

export const triggerNotebookQueryChange = async () => {
  await userEvent.click(await screen.findByText("Row limit"));

  const rowLimitInput = await within(
    screen.getByTestId("step-limit-0-0"),
  ).findByPlaceholderText("Enter a limit");

  await userEvent.click(rowLimitInput);
  await userEvent.type(rowLimitInput, "1");
  await userEvent.tab();
};

/**
 * Reverts triggerNotebookQueryChange call
 */
export const revertNotebookQueryChange = async () => {
  const limitStep = screen.getByTestId("step-limit-0-0");
  const limitInput = await within(limitStep).findByPlaceholderText(
    "Enter a limit",
  );

  await userEvent.click(limitInput);
  await userEvent.type(limitInput, "{backspace}");
  await userEvent.tab();
};

export const waitForSaveChangesToBeEnabled = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
};

export const waitForSaveChangesToBeDisabled = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
};

export const waitForSaveToBeEnabled = async () => {
  await waitFor(() => {
    expect(screen.getByText("Save")).toBeEnabled();
  });
};

export const waitForNativeQueryEditorReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
  });
};

export const waitForFaviconReady = async (container: HTMLElement) => {
  await waitFor(() => {
    const faviconLink = container.querySelector("link[rel=icon]");
    expect(faviconLink).toHaveAttribute("href", LOAD_COMPLETE_FAVICON);
  });
};
