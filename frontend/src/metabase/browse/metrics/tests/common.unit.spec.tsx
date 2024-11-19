import { screen, within } from "__support__/ui";

import { setup } from "./setup";

describe("BrowseMetrics (OSS)", () => {
  it("displays an empty message when no metrics are found", async () => {
    setup({ metricCount: 0 });
    expect(
      await screen.findByText(
        "Create Metrics to define the official way to calculate important numbers for your team",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Create metric")).toBeInTheDocument();
  });

  it("should not show the Create metric button if the user does not have data access", async () => {
    setup({ metricCount: 0, databases: [] });
    expect(
      await screen.findByText(
        "Create Metrics to define the official way to calculate important numbers for your team",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create metric")).not.toBeInTheDocument();
  });

  it("displays a link to the metrics docs", async () => {
    setup({ metricCount: 0 });
    await screen.findByText(
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });

  it("displays the Our Analytics collection if it has a metric", async () => {
    setup({ metricCount: 25 });
    const table = await screen.findByRole("table", {
      name: /Table of metrics/,
    });
    expect(table).toBeInTheDocument();
    expect(
      within(table).getAllByTestId("path-for-collection: Our analytics"),
    ).toHaveLength(2);
    expect(within(table).getByText("Metric 20")).toBeInTheDocument();
    expect(within(table).getByText("Metric 21")).toBeInTheDocument();
    expect(within(table).getByText("Metric 22")).toBeInTheDocument();
  });

  it("displays collection breadcrumbs", async () => {
    setup({ metricCount: 5 });
    const table = await screen.findByRole("table", {
      name: /Table of metrics/,
    });
    expect(within(table).getByText("Metric 1")).toBeInTheDocument();
    expect(
      within(table).getAllByTestId("path-for-collection: Alpha"),
    ).toHaveLength(3);
  });
});
