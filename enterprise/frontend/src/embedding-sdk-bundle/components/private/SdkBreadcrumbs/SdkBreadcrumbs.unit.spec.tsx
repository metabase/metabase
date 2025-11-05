import { act, screen, waitFor, within } from "__support__/ui";

import { setup } from "./setup.spec";

describe("SdkBreadcrumbs", () => {
  it("shows the reported location from collection browser and dashboard", async () => {
    await setup();

    // Wait for the collection browser to be visible
    await waitFor(() => {
      expect(screen.getByText("Last edited by")).toBeInTheDocument();
    });

    const breadcrumbsContainer = screen.getByTestId("breadcrumbs-container");
    expect(
      within(breadcrumbsContainer).getByText("Our analytics"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("current-view-type")).toHaveTextContent(
      "collection",
    );

    // Click on the collection browser item.
    screen.getByText("Test Dashboard").click();

    await waitFor(() => {
      expect(screen.getByTestId("current-view-id")).toHaveTextContent("1");
    });

    expect(screen.getByTestId("current-view-type")).toHaveTextContent(
      "dashboard",
    );

    // Dashboard should report its location.
    await waitFor(() => {
      expect(
        within(breadcrumbsContainer).getByText("Test Dashboard"),
      ).toBeInTheDocument();
    });

    // After going back to the root collection, it should no longer show the dashboard on the breadcrumb.
    within(breadcrumbsContainer).getByText("Our analytics").click();

    await waitFor(() => {
      expect(
        within(breadcrumbsContainer).queryByText("Test Dashboard"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the reported location from the question", async () => {
    await setup();

    // Wait for the collection browser to be visible
    await waitFor(() => {
      expect(screen.getByText("Last edited by")).toBeInTheDocument();
    });

    // Click on the question
    screen.getByText("Test Question").click();

    await waitFor(() => {
      expect(screen.getByTestId("current-view-id")).toHaveTextContent("1");
    });

    expect(screen.getByTestId("current-view-type")).toHaveTextContent(
      "question",
    );

    const breadcrumbsContainer = screen.getByTestId("breadcrumbs-container");

    // Question should report its location and show in breadcrumbs
    await waitFor(() => {
      expect(
        within(breadcrumbsContainer).getByText("Test Question"),
      ).toBeInTheDocument();
    });

    // Navigate back to root collection
    within(breadcrumbsContainer).getByText("Our analytics").click();

    // Question should disappear from the breadcrumb
    await waitFor(() => {
      expect(
        within(breadcrumbsContainer).queryByText("Test Question"),
      ).not.toBeInTheDocument();
    });
  });

  it("navigates to nested collection and back via breadcrumbs", async () => {
    await setup();

    // Wait for the collection browser to be visible
    await waitFor(() => {
      expect(screen.getByText("Last edited by")).toBeInTheDocument();
    });

    const breadcrumbsContainer = screen.getByTestId("breadcrumbs-container");

    expect(
      within(breadcrumbsContainer).getByText("Our analytics"),
    ).toBeInTheDocument();

    // Click on a nested collection on collection browser
    act(() => {
      screen.getByText("Nested Collection").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("current-view-id")).toHaveTextContent("2");
    });

    await waitFor(() => {
      expect(screen.getByText("This collection is empty")).toBeInTheDocument();
    });

    expect(
      within(breadcrumbsContainer).getByText("Our analytics"),
    ).toBeInTheDocument();

    // Click on the root collection breadcrumb to go back
    act(() => {
      within(breadcrumbsContainer).getByText("Our analytics").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("current-view-id")).toHaveTextContent("root");
    });

    // Should be back in root collection
    expect(
      within(breadcrumbsContainer).getByText("Our analytics"),
    ).toBeInTheDocument();
  });
});
