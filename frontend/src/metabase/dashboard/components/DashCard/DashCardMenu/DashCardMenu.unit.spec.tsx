import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCardQueryDownloadEndpoint,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import { DashCardMenu } from "./DashCardMenu";

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

const TEST_CARD_MODEL = createMockCard({
  can_write: true,
  type: "model",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_CARD_METRIC = createMockCard({
  can_write: true,
  type: "metric",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_CARD_NO_DATA_ACCESS = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {},
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

const setup = ({
  card = TEST_CARD,
  result = TEST_RESULT,
  canEdit = true,
  onEditVisualization,
}: SetupOpts & {
  canEdit?: boolean;
  onEditVisualization?: () => void;
} = {}) => {
  const mockDashboard = createMockDashboard();

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
      dashboards: [mockDashboard],
    }),
    dashboard: createMockDashboardState({
      dashboardId: mockDashboard.id,
      dashboards: {
        [mockDashboard.id]: createMockStoreDashboard({
          id: mockDashboard.id,
          name: mockDashboard.name,
        }),
      },
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const question = checkNotNull(metadata.question(card.id));
  const dashcard = createMockDashboardCard({
    ...card,
    dashboard_id: card.dashboard_id ?? undefined,
  });

  setupCardQueryDownloadEndpoint(card, "json");

  setupLastDownloadFormatEndpoints();
  const { history } = renderWithProviders(
    <>
      <Route
        path="dashboard/:slug"
        component={() => (
          <MockDashboardContext
            dashboardId={mockDashboard.id}
            dashboard={mockDashboard}
            navigateToNewCardFromDashboard={null}
          >
            <DashCardMenu
              question={question}
              result={result}
              dashcard={dashcard}
              canEdit={canEdit}
              onEditVisualization={onEditVisualization}
            />
          </MockDashboardContext>
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

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Edit question"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/question/${TEST_CARD_SLUG}/notebook`);
  });

  it("should display a link to the query builder for native questions", async () => {
    const { history } = setup({ card: TEST_CARD_NATIVE });

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Edit question"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/question/${TEST_CARD_SLUG}`);
  });

  it("should display a link to the editor for models", async () => {
    const { history } = setup({ card: TEST_CARD_MODEL });

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Edit model"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/model/${TEST_CARD_SLUG}/query`);
  });

  it("should display a link to the editor for metrics", async () => {
    const { history } = setup({ card: TEST_CARD_METRIC });

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Edit metric"));

    const pathname = history?.getCurrentLocation().pathname;
    expect(pathname).toBe(`/metric/${TEST_CARD_SLUG}/query`);
  });

  it("should not display a link to the notebook editor if the user does not have the data permission", async () => {
    setup({ card: TEST_CARD_NO_DATA_ACCESS });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should not display a link to the notebook editor if the user does not have the collection write permission (metabase#35077)", async () => {
    setup({ card: TEST_CARD_NO_COLLECTION_WRITE_ACCESS });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should display query export options", async () => {
    setup();

    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Save screenshot")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Download results"));

    expect(
      await screen.findByRole("heading", { name: /download/i }),
    ).toBeInTheDocument();
  });

  it("should not display query export options when query is running", async () => {
    setup({ result: {} as any });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
    expect(screen.queryByText("Download results")).not.toBeInTheDocument();
  });

  it("should not display query export options when there is a query error", async () => {
    setup({ result: TEST_RESULT_ERROR });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
    expect(screen.queryByText("Download results")).not.toBeInTheDocument();
  });

  it("should not display Edit question when canEdit is false", async () => {
    setup({ canEdit: false });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should not display Edit visualization when canEdit is false", async () => {
    const onEditVisualization = jest.fn();
    setup({ canEdit: false, onEditVisualization });

    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit visualization")).not.toBeInTheDocument();
  });
});
