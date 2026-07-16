import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppsNavbarSection } from "./DataAppsNavbarSection";

describe("DataAppsNavbarSection", () => {
  it("does not show apps section when there are no data apps", async () => {
    fetchMock.get("path:/api/apps?available=true", []);

    renderWithProviders(<DataAppsNavbarSection onItemSelect={jest.fn()} />);

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Data apps" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows every data app as a link", async () => {
    fetchMock.get("path:/api/apps?available=true", [
      createMockDataApp({ id: 1, name: "gizmo", display_name: "Gizmo" }),
      createMockDataApp({ id: 2, name: "gadget", display_name: "Gadget" }),
    ]);

    renderWithProviders(
      <Route
        path="/"
        component={() => <DataAppsNavbarSection onItemSelect={jest.fn()} />}
      />,
      { withRouter: true },
    );

    expect(
      await screen.findByRole("heading", { name: "Data apps" }),
    ).toBeInTheDocument();

    const gizmoLink = await screen.findByRole("link", { name: /Gizmo/ });
    expect(gizmoLink).toHaveAttribute("href", "/apps/gizmo");

    expect(
      within(gizmoLink).getByRole("img", { name: "app icon" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Gadget/ })).toHaveAttribute(
      "href",
      "/apps/gadget",
    );
  });
});
