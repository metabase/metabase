import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui-minimal";

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
    await userEvent.click(screen.getByText("Test Dashboard"));

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
    await userEvent.click(
      within(breadcrumbsContainer).getByText("Our analytics"),
    );

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
    await userEvent.click(screen.getByText("Test Question"));

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
    await userEvent.click(
      within(breadcrumbsContainer).getByText("Our analytics"),
    );

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
    await userEvent.click(screen.getByText("Nested Collection"));

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
    await userEvent.click(
      within(breadcrumbsContainer).getByText("Our analytics"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-view-id")).toHaveTextContent("root");
    });

    // Should be back in root collection
    expect(
      within(breadcrumbsContainer).getByText("Our analytics"),
    ).toBeInTheDocument();
  });
});
