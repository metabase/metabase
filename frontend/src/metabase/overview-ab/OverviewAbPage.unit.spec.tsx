import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSearchEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockSearchResult } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { OverviewAbPage } from "./OverviewAbPage";

jest.mock("metabase/metric-cube-viewer", () => ({
  MetricCubeViewer: ({
    tableId,
    generatorId,
  }: {
    tableId: number;
    generatorId: string;
  }) => (
    <div data-testid="metric-cube-viewer">
      {tableId}:{generatorId}
    </div>
  ),
}));

function setup({ route = "/_internal/overview" }: { route?: string } = {}) {
  const posted: { body?: Record<string, unknown> } = {};
  setupSearchEndpoints([
    createMockSearchResult({ id: ORDERS_ID, name: "Orders", model: "table" }),
  ]);
  setupTableQueryMetadataEndpoint(createOrdersTable());
  fetchMock.get("path:/api/viz-eval/overview-judgements", []);
  fetchMock.post("path:/api/viz-eval/overview-judgements", async (call) => {
    posted.body = await call.request?.json();
    return { ...posted.body, id: 1 };
  });

  const { router } = renderWithProviders(
    <>
      <Route path="/_internal/overview" element={<OverviewAbPage />} />
      <Route
        path="/_internal/overview/:entityType/:id"
        element={<OverviewAbPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute: route,
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );
  return { posted, router };
}

describe("OverviewAbPage", () => {
  it("renders the top bar with entity types, arms and both verdict groups", () => {
    setup();

    expect(screen.getByRole("radio", { name: "Metric" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Transform" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();
    expect(screen.getByText("Old visualization")).toBeInTheDocument();
    expect(screen.getByText("New visualization")).toBeInTheDocument();
    expect(screen.getByText("Gen:")).toBeInTheDocument();
    expect(screen.getByText("Viz:")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Old better/ })).toHaveLength(
      2,
    );
    expect(screen.getAllByText("Pick something to review")).toHaveLength(2);
  });

  it("navigates to the table when one is picked from search", async () => {
    const { router } = setup({
      route: "/_internal/overview?viz=default-viz-v1",
    });

    await userEvent.type(
      screen.getByTestId("overview-ab-entity-select"),
      "Ord",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Orders" }),
    );

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        `/_internal/overview/table/${ORDERS_ID}`,
      ),
    );
    expect(router?.location.search).toBe("?viz=default-viz-v1");
    expect(
      (await screen.findAllByTestId("metric-cube-viewer"))[0],
    ).toHaveTextContent(`${ORDERS_ID}:score-and-pick`);
  });

  it("posts a generation verdict describing both arms", async () => {
    const { posted } = setup({
      route: `/_internal/overview/table/${ORDERS_ID}?gen=every-combination`,
    });

    expect(
      (await screen.findAllByTestId("metric-cube-viewer"))[0],
    ).toHaveTextContent(`${ORDERS_ID}:every-combination`);
    const [genNewBetter] = screen.getAllByRole("button", {
      name: /New better/,
    });
    await waitFor(() => expect(genNewBetter).toBeEnabled());
    await userEvent.click(genNewBetter);

    await waitFor(() => expect(posted.body).toBeDefined());
    expect(posted.body).toMatchObject({
      entity_type: "table",
      entity_id: ORDERS_ID,
      entity_name: "Orders",
      axis: "generation",
      verdict: "new",
      gen: "every-combination",
      baseline_gen: "score-and-pick",
      viz: "default-viz-v1",
      baseline_viz: "dimension-type",
      tiles: [],
    });
  });

  it("posts a visualization verdict from its hotkey", async () => {
    const { posted } = setup({
      route: `/_internal/overview/table/${ORDERS_ID}?viz=default-viz-v1`,
    });

    await screen.findAllByTestId("metric-cube-viewer");
    await userEvent.keyboard("q");

    await waitFor(() => expect(posted.body).toBeDefined());
    expect(posted.body).toMatchObject({
      axis: "visualization",
      verdict: "old",
      viz: "default-viz-v1",
    });
  });
});
