// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  cleanup,
  mockUseDataAppBundle,
  setup,
  setupSettings,
} from "./tests/setup";

import userEvent from "@testing-library/user-event";

import { act, render, renderHook, screen, waitFor } from "__support__/ui";
import { useDataAppLocation } from "embedding-sdk-package/hooks/public/use-data-app-location";
import { navigate } from "embedding-sdk-package/lib/private/data-app-routing";

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

  it("reports in-app navigation to the host", async () => {
    window.history.replaceState(
      null,
      "",
      "/embed/embedded-apps/sales/orders?active=true",
    );

    function App() {
      const { navigate } = useDataAppLocation();

      return (
        <button onClick={() => navigate("/orders/42?tab=items#notes")}>
          Order 42
        </button>
      );
    }

    mockUseDataAppBundle.mockReturnValue({
      failed: false,
      data: { component: App, providerProps: {} },
    });

    const { sendMessage } = setupSettings();
    render(<DataAppEmbed />);

    await userEvent.click(screen.getByRole("button", { name: "Order 42" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "metabase.embed.dataAppPathChange",
      data: { path: "sales/orders/42?tab=items#notes" },
    });
  });

  it("does not report navigation to the host's own path", () => {
    const onPathChange = jest.fn<void, [string]>();

    const { rerender } = renderHook(
      ({ path }) =>
        useDataAppPathNavigation({ slug: "sales", path, onPathChange }),
      { initialProps: { path: "sales" } },
    );

    rerender({ path: "sales/orders?active=true" });

    expect(window.location.pathname).toBe("/embed/embedded-apps/sales/orders");
    expect(onPathChange).not.toHaveBeenCalled();
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
        slug: "sales",
        path: "sales/orders?active=true",
      }),
    );

    expect(pushState).not.toHaveBeenCalled();
  });

  it("navigates when the host sets the same path again", () => {
    const initialProps: {
      navigationRequest: { path: string } | null;
    } = { navigationRequest: null };

    const { rerender } = renderHook(
      ({ navigationRequest }) =>
        useDataAppPathNavigation({
          slug: "sales",
          path: "sales/orders/details?tab=summary",
          navigationRequest,
        }),
      { initialProps },
    );

    // simulates in-app navigation
    window.history.replaceState(null, "", "/embed/embedded-apps/sales/orders");

    const pushState = jest.spyOn(window.history, "pushState");
    const replaceState = jest.spyOn(window.history, "replaceState");

    // host sets the same path again after in-app navigation
    rerender({
      navigationRequest: {
        path: "sales/orders/details?tab=summary",
      },
    });

    expect(window.location.href).toBe(
      `${window.location.origin}/embed/embedded-apps/sales/orders/details?tab=summary`,
    );

    // the host owns the history entry, so the iframe must not
    // add a second back-button step.
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/embed/embedded-apps/sales/orders/details?tab=summary",
    );

    expect(pushState).not.toHaveBeenCalled();
  });

  it("reports the query as it appears in the url", () => {
    const { onPathChange } = setupPathNavigation({ path: "sales" });

    act(() => navigate("/search?q=a%20b&ids=1,2&flag"));

    expect(window.location.search).toBe("?q=a%20b&ids=1,2&flag");
    expect(onPathChange).toHaveBeenCalledWith(
      "sales/search?q=a%20b&ids=1,2&flag",
    );
  });

  it("reports the app root as the bare slug", async () => {
    window.history.replaceState(null, "", "/embed/embedded-apps/sales/orders");

    const { onPathChange, rerender } = setupPathNavigation({
      path: "sales/orders",
    });

    rerender({ path: "sales" });
    act(() => navigate("/products"));
    act(() => window.history.back());

    await waitFor(() => expect(onPathChange).toHaveBeenCalledTimes(2));
    expect(onPathChange).toHaveBeenLastCalledWith("sales");
  });

  it("does not report navigation that leaves the app", () => {
    const { onPathChange } = setupPathNavigation({ path: "sales" });

    act(() => navigate("/../other-app/foo"));

    expect(window.location.pathname).toBe("/embed/embedded-apps/other-app/foo");
    expect(onPathChange).not.toHaveBeenCalled();
  });
});

function setupPathNavigation({ path }: { path: string }) {
  const onPathChange = jest.fn<void, [string]>();

  const view = renderHook(
    ({ path }) =>
      useDataAppPathNavigation({ slug: "sales", path, onPathChange }),
    { initialProps: { path } },
  );

  return { ...view, onPathChange };
}
