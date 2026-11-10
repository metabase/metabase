import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppsNavbarSection } from "./DataAppsNavbarSection";

describe("DataAppsNavbarSection", () => {
  it("does not show apps section when there are no data apps", async () => {
    fetchMock.get("path:/api/ee/apps", []);

    renderWithProviders(<DataAppsNavbarSection onItemSelect={jest.fn()} />);

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Data apps" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows every enabled, current data app as a link", async () => {
    fetchMock.get("path:/api/ee/apps", [
      createMockDataApp({ name: "gizmo", display_name: "Gizmo" }),
      createMockDataApp({ name: "gadget", display_name: "Gadget" }),
      createMockDataApp({
        name: "disabled",
        display_name: "Disabled",
        enabled: false,
      }),
      createMockDataApp({
        name: "outdated",
        display_name: "Outdated",
        outdated: true,
      }),
    ]);

    const onItemSelect = jest.fn();

    renderWithProviders(
      <Route
        path="/"
        element={<DataAppsNavbarSection onItemSelect={onItemSelect} />}
      />,
      { withRouter: true },
    );

    expect(
      await screen.findByRole("heading", { name: "Data apps" }),
    ).toBeInTheDocument();

    const gizmoLink = await screen.findByRole("link", { name: /Gizmo/ });
    expect(gizmoLink).toHaveAttribute("href", "/apps/gizmo");
    expect(gizmoLink).toHaveAttribute("target", "_blank");

    expect(
      within(gizmoLink).getByRole("img", { name: "app icon" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Gadget/ })).toHaveAttribute(
      "href",
      "/apps/gadget",
    );

    await userEvent.click(gizmoLink);

    expect(onItemSelect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /Gizmo|Gadget/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Contents/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Disabled|Outdated/ }),
    ).not.toBeInTheDocument();
  });

  it("links to the site-url origin when apps are served cross-origin", async () => {
    fetchMock.get("path:/api/ee/apps", [
      createMockDataApp({ name: "gizmo", display_name: "Gizmo" }),
    ]);

    renderWithProviders(
      <Route
        path="/"
        element={<DataAppsNavbarSection onItemSelect={jest.fn()} />}
      />,
      {
        withRouter: true,
        storeInitialState: createMockState({
          settings: createMockSettingsState({
            "isolated-origin": "https://apps.example.com",
            "site-url": "https://mb.example.com",
          }),
        }),
      },
    );

    expect(await screen.findByRole("link", { name: /Gizmo/ })).toHaveAttribute(
      "href",
      "https://mb.example.com/apps/gizmo",
    );
  });
});
