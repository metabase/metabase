import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { setupCardQueryDownloadEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { DashCardMenuConnected } from "./DashCardMenu";

const TEST_CARD = createMockCard({
  can_write: true,
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_CARD_SLUG = `${TEST_CARD.id}-${TEST_CARD.name.toLocaleLowerCase()}`;

const TEST_CARD_NATIVE = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
    native: {
      query: "SELECT * FROM ORDERS",
    },
  }),
});

const TEST_CARD_NO_DATA_ACCESS = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

const TEST_CARD_NO_COLLECTION_WRITE_ACCESS = createMockCard({
  can_write: false,
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_RESULT = createMockDataset();

const TEST_RESULT_ERROR = createMockDataset({
  error: {
    status: 500,
    data: "An error occurred",
  },
});

interface SetupOpts {
  card?: Card;
  result?: Dataset;
}

const setup = ({ card = TEST_CARD, result = TEST_RESULT }: SetupOpts = {}) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const question = checkNotNull(metadata.question(card.id));

  setupCardQueryDownloadEndpoint(card, "json");

  const { history } = renderWithProviders(
    <>
      <Route
        path="dashboard/:slug"
        component={() => (
          <DashCardMenuConnected question={question} result={result} />
        )}
      />
      <Route path="question/:slug" component={() => <div />} />
      <Route path="question/:slug/notebook" component={() => <div />} />
    </>,
    {
      storeInitialState,
      withRouter: true,
      initialRoute: "/dashboard/1",
    },
  );

  return { history };
};

describe("DashCardMenu", () => {
  it("should display a link to the notebook editor", async () => {
    const { history } = setup();

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Edit question"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/question/${TEST_CARD_SLUG}/notebook`);
  });

  it("should display a link to the query builder for native questions", async () => {
    const { history } = setup({ card: TEST_CARD_NATIVE });

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Edit question"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/question/${TEST_CARD_SLUG}`);
  });

  it("should not display a link to the notebook editor if the user does not have the data permission", async () => {
    setup({ card: TEST_CARD_NO_DATA_ACCESS });

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should not display a link to the notebook editor if the user does not have the collection write permission (metabase#35077)", async () => {
    setup({ card: TEST_CARD_NO_COLLECTION_WRITE_ACCESS });

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should display query export options", async () => {
    setup();

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Download results"));

    expect(screen.getByText("Download full results")).toBeInTheDocument();
  });

  it("should not display query export options when there is a query error", async () => {
    setup({ result: TEST_RESULT_ERROR });

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
    expect(screen.queryByText("Download results")).not.toBeInTheDocument();
  });
});
