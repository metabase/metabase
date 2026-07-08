import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelJobRunEndpoint,
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";

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
  // Filter by a single type so the table has ≤ 4 rows — the TreeTable virtualizes,
  // so asserting on a filtered subset avoids off-screen rows being absent from the DOM.

  it("filters to job runs (via the URL) and labels them Job", async () => {
    setup({ initialRoute: "/data-studio/transforms/runs?types=job" });

    expect(await screen.findByText("Hourly refresh")).toBeInTheDocument();
    expect(screen.getByText("Nightly rollups")).toBeInTheDocument();
    expect(screen.getByText("Weekly archive")).toBeInTheDocument();
    expect(screen.getByText("Monthly export")).toBeInTheDocument();
    // Scope the type-cell count to the table (the filter chip also reads "Job").
    const table = screen.getByRole("treegrid", { name: "Runs" });
    expect(within(table).getAllByText("Job")).toHaveLength(4);
    // Non-job runs are filtered out.
    expect(screen.queryByText("Products normalized")).not.toBeInTheDocument();
  });

  it("renders DAG runs with directional names and a Transformation type", async () => {
    setup({ initialRoute: "/data-studio/transforms/runs?types=dag" });

    expect(
      await screen.findByText("Orders cleaned → Downstream"),
    ).toBeInTheDocument();
    expect(screen.getByText("Upstream → Revenue by month")).toBeInTheDocument();
    expect(
      screen.getByText("Upstream → Customers deduped"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sessions enriched → Downstream"),
    ).toBeInTheDocument();
    const table = screen.getByRole("treegrid", { name: "Runs" });
    expect(within(table).getAllByText("Transformation")).toHaveLength(4);
  });

  it("renders standalone transform runs by name", async () => {
    setup({ initialRoute: "/data-studio/transforms/runs?types=transform" });

    expect(await screen.findByText("Products normalized")).toBeInTheDocument();
    expect(screen.getByText("Inventory snapshot")).toBeInTheDocument();
    expect(screen.getByText("Payments reconciled")).toBeInTheDocument();
    expect(screen.getByText("Events deduped")).toBeInTheDocument();
    const table = screen.getByRole("treegrid", { name: "Runs" });
    expect(within(table).getAllByText("Transformation")).toHaveLength(4);
  });

  it("opens a sidebar with the member transforms when a DAG run is clicked", async () => {
    setup({ initialRoute: "/data-studio/transforms/runs?types=dag" });

    await userEvent.click(
      await screen.findByText("Upstream → Customers deduped"),
    );

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    // The failed upstream DAG run resolves to its member transform runs.
    expect(
      await within(sidebar).findByText("Customers deduped"),
    ).toBeInTheDocument();
    // The failed member surfaces its error message.
    expect(
      within(sidebar).getByRole("region", { name: "Error" }),
    ).toBeInTheDocument();
    // Header links to the seed transform (entity id 12 in the fixture).
    expect(
      within(sidebar).getByRole("link", { name: "View this transform" }),
    ).toHaveAttribute("href", "/data-studio/transforms/12");
  });

  it("cancels an in-progress job run via the job-run cancel endpoint", async () => {
    // The started "Nightly rollups" job run is job id 2, run id 102 in the fixture.
    setupCancelJobRunEndpoint(2, 102);
    setup({ initialRoute: "/data-studio/transforms/runs?types=job" });

    await userEvent.click(await screen.findByText("Nightly rollups"));

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    // Header links to the job details page (job id 2 in the fixture).
    expect(
      within(sidebar).getByRole("link", { name: "View this job" }),
    ).toHaveAttribute("href", "/data-studio/transforms/jobs/2");

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Cancel run" }),
    );

    // Confirm in the dialog (its confirm button is also labelled "Cancel run").
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel run" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/transform-job/2/runs/102/cancel",
        ),
      ).toBe(true);
    });
  });
});
