import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";

import { TransformGraphRunListPage } from "./TransformGraphRunListPage";

// The list and each run's member transforms are backed by a local fixture
// (transform-graph-runs.mock) via queryFn until the backend combined endpoint
// lands, so these tests assert against it. The transforms list (for the Transform
// filter) is a real endpoint and is mocked here.
function setup({ initialRoute = "/data-studio/transforms/runs" } = {}) {
  setupUserMetabotPermissionsEndpoint();
  setupListTransformsEndpoint([]);
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  renderWithProviders(
    <Route
      path="/data-studio/transforms/runs"
      component={TransformGraphRunListPage}
    />,
    { withRouter: true, initialRoute },
  );
}

describe("TransformGraphRunListPage", () => {
  it("renders each run's name in the Run column and a Job/Transformation type", async () => {
    setup();

    // Run column: job/transform names as plain text, DAG runs as name + arrow.
    expect(await screen.findByText("Hourly refresh")).toBeInTheDocument();
    expect(screen.getByText("Upstream → Revenue by month")).toBeInTheDocument();
    expect(screen.getByText("Orders cleaned → Downstream")).toBeInTheDocument();
    expect(screen.getByText("Customers deduped")).toBeInTheDocument();

    // Type column: "Job" for the two jobs, "Transformation" for the two DAG
    // runs and the two standalone transform runs.
    expect(screen.getAllByText("Job")).toHaveLength(2);
    expect(screen.getAllByText("Transformation")).toHaveLength(4);
  });

  it("filters the runs by type from the URL", async () => {
    setup({ initialRoute: "/data-studio/transforms/runs?types=job" });

    expect(await screen.findByText("Hourly refresh")).toBeInTheDocument();
    expect(screen.getByText("Nightly rollups")).toBeInTheDocument();
    expect(
      screen.queryByText("Orders cleaned → Downstream"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Customers deduped")).not.toBeInTheDocument();
  });

  it("opens a sidebar with the member transforms when a DAG run is clicked", async () => {
    setup();

    await userEvent.click(
      await screen.findByText("Upstream → Revenue by month"),
    );

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    // The upstream DAG run (dag-202) resolves to two member transform runs.
    expect(
      await within(sidebar).findByText("Revenue by month"),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("Orders cleaned")).toBeInTheDocument();
    // The failed member surfaces its error message.
    expect(
      within(sidebar).getByRole("region", { name: "Error" }),
    ).toBeInTheDocument();
  });
});
