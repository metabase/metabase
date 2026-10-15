import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";

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
      { name: "gizmo", display_name: "Gizmo", resource_collection_id: 42 },
      { name: "gadget", display_name: "Gadget", resource_collection_id: 43 },
    ]);

    renderWithProviders(
      <Route
        path="/"
        element={<DataAppsNavbarSection onItemSelect={jest.fn()} />}
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
  });

  it("expands contents when the chevron is clicked", async () => {
    fetchMock.get("path:/api/apps?available=true", [
      { name: "gizmo", display_name: "Gizmo", resource_collection_id: 42 },
      { name: "gadget", display_name: "Gadget", resource_collection_id: 43 },
    ]);

    const onItemSelect = jest.fn();

    renderWithProviders(
      <>
        <Route
          path="/"
          element={<DataAppsNavbarSection onItemSelect={onItemSelect} />}
        />

        <Route
          path="/collection/42"
          element={<div>Gizmo collection page</div>}
        />
      </>,
      { withRouter: true },
    );

    const gizmoToggle = await screen.findByRole("button", {
      name: "Expand Gizmo",
    });

    expect(
      screen.queryByRole("link", { name: /Contents/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(gizmoToggle);

    // gizmo app should be expanded
    expect(gizmoToggle).toHaveAttribute("aria-expanded", "true");
    expect(onItemSelect).not.toHaveBeenCalled();

    // gadget app should not be expanded
    expect(
      screen.getByRole("button", { name: "Expand Gadget" }),
    ).toHaveAttribute("aria-expanded", "false");

    const contentsLink = screen.getByRole("link", { name: /Contents/ });
    expect(contentsLink).toHaveAttribute("href", "/collection/42");
    expect(contentsLink).not.toHaveAttribute("target", "_blank");

    await userEvent.click(screen.getByRole("link", { name: /Gizmo/ }));
    expect(onItemSelect).toHaveBeenCalledTimes(1);
    expect(contentsLink).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse Gizmo" }),
    );

    expect(
      screen.queryByRole("link", { name: /Contents/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand Gizmo" }));
    await userEvent.click(screen.getByRole("link", { name: /Contents/ }));
    expect(onItemSelect).toHaveBeenCalledTimes(2);

    expect(
      await screen.findByText("Gizmo collection page"),
    ).toBeInTheDocument();
  });

  it("expands contents when the chevron is activated with the keyboard", async () => {
    fetchMock.get("path:/api/apps?available=true", [
      { name: "gizmo", display_name: "Gizmo", resource_collection_id: 42 },
    ]);

    renderWithProviders(
      <Route
        path="/"
        element={<DataAppsNavbarSection onItemSelect={jest.fn()} />}
      />,
      { withRouter: true },
    );

    const toggle = await screen.findByRole("button", { name: "Expand Gizmo" });
    toggle.focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("link", { name: /Contents/ })).toBeInTheDocument();

    await userEvent.keyboard(" ");

    expect(
      screen.queryByRole("link", { name: /Contents/ }),
    ).not.toBeInTheDocument();
  });
});
