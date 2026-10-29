// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  cleanup,
  mockUseDataAppBundle,
  setup,
  setupSettings,
} from "./tests/setup";

import userEvent from "@testing-library/user-event";

import { render, renderHook, screen } from "__support__/ui";
import { useDataAppLocation } from "embedding-sdk-package/hooks/public/use-data-app-location";

import { DataAppEmbed } from "./DataAppEmbed";
import { useDataAppPathNavigation } from "./hooks/use-data-app-path-navigation";

describe("DataAppEmbed - router navigation", () => {
  const originalRoot = window.MetabaseRoot;

  beforeEach(setup);

  afterEach(() => {
    window.MetabaseRoot = originalRoot;
    cleanup();
  });

  it("navigates to a new path without remounting", async () => {
    function App() {
      const { pathname } = useDataAppLocation();

      return (
        <>
          <p>{pathname}</p>
          <input aria-label="Gizmo" />
        </>
      );
    }

    mockUseDataAppBundle.mockReturnValue({
      failed: false,
      data: { component: App, providerProps: {} },
    });

    const { rerender } = render(<DataAppEmbed />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Gizmo" }),
      "Example",
    );

    // preceding slashes should be ignored
    setupSettings({ path: "///sales/products?active=false#details" });
    rerender(<DataAppEmbed />);

    // data app path should be updated
    expect(await screen.findByText("/products")).toBeInTheDocument();

    // iframe url should be updated
    expect(window.location.href).toBe(
      `${window.location.origin}/embed/embedded-apps/sales/products?active=false#details`,
    );

    // input should stay mounted
    expect(screen.getByRole("textbox", { name: "Gizmo" })).toHaveValue(
      "Example",
    );
  });

  it("does not do client-side navigation again if path already matches", () => {
    window.MetabaseRoot = "/mb/";

    window.history.replaceState(
      null,
      "",
      "/mb/embed/embedded-apps/sales/orders?active=true&embed-js-identifier=1",
    );

    const pushState = jest.spyOn(window.history, "pushState");

    renderHook(() =>
      useDataAppPathNavigation({
        name: "sales",
        path: "sales/orders?active=true",
      }),
    );

    expect(pushState).not.toHaveBeenCalled();
  });
});
