import userEvent from "@testing-library/user-event";
import type { RouteResponse } from "fetch-mock";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppsNavbarSection } from "./DataAppsNavbarSection";

const setup = (response: RouteResponse) => {
  fetchMock.get("path:/api/apps", response);
  const onItemSelect = jest.fn();

  renderWithProviders(
    <Route
      path="*"
      component={() => <DataAppsNavbarSection onItemSelect={onItemSelect} />}
    />,
    { withRouter: true },
  );

  return { onItemSelect };
};

describe("DataAppsNavbarSection", () => {
  it("shows enabled apps as flat links and excludes disabled apps", async () => {
    const { onItemSelect } = setup([
      createMockDataApp({ id: 1, name: "sales", display_name: "Sales" }),
      createMockDataApp({
        id: 2,
        name: "operations",
        display_name: "Operations",
      }),
      createMockDataApp({
        id: 3,
        name: "disabled",
        display_name: "Disabled",
        enabled: false,
      }),
    ]);

    const salesItem = await screen.findByRole("listitem", { name: "Sales" });
    const operationsItem = screen.getByRole("listitem", {
      name: "Operations",
    });
    const salesLink = within(salesItem).getByRole("link");
    const operationsLink = within(operationsItem).getByRole("link");

    expect(salesLink).toHaveAttribute("href", "/apps/sales");
    expect(operationsLink).toHaveAttribute("href", "/apps/operations");
    expect(
      screen.queryByRole("listitem", { name: "Disabled" }),
    ).not.toBeInTheDocument();

    await userEvent.click(salesLink);
    expect(onItemSelect).toHaveBeenCalledTimes(1);
  });

  it("is expanded initially and can be collapsed", async () => {
    setup([createMockDataApp()]);

    const heading = await screen.findByRole("heading", { name: "Data Apps" });
    expect(screen.getByRole("listitem", { name: "Sales" })).toBeInTheDocument();

    await userEvent.click(heading);

    expect(
      screen.queryByRole("listitem", { name: "Sales" }),
    ).not.toBeInTheDocument();
  });

  it("is hidden when there are no enabled apps", async () => {
    setup([createMockDataApp({ enabled: false })]);

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/apps")).toBe(true);
    });
    expect(
      screen.queryByRole("heading", { name: "Data Apps" }),
    ).not.toBeInTheDocument();
  });

  it("is hidden when the app list request fails", async () => {
    setup(500);

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/apps")).toBe(true);
    });
    expect(
      screen.queryByRole("heading", { name: "Data Apps" }),
    ).not.toBeInTheDocument();
  });
});
