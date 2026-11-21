// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  cleanup,
  mockUseDataAppBundle,
  setup,
  setupSettings,
} from "./tests/setup";

import userEvent from "@testing-library/user-event";

import { act, render, renderHook, screen } from "__support__/ui";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { navigate } from "embedding-sdk-package/data-apps/private/lib/data-app-routing";
import { useDataAppLocation } from "embedding-sdk-package/data-apps/public/hooks/use-data-app-location";

import { DataAppEmbed } from "./DataAppEmbed";
import { useDataAppPathNavigation } from "./hooks/use-data-app-path-navigation";

const store = getSdkStore();

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

    const { rerender } = render(<DataAppEmbed store={store} />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Gizmo" }),
      "Example",
    );

    // preceding slashes should be ignored
    setupSettings({ path: "///sales/products?active=false#details" });
    rerender(<DataAppEmbed store={store} />);

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
        <button onClick={() => navigate("/orders/42?tab=a%20b&flag#notes")}>
          Order 42
        </button>
      );
    }

    mockUseDataAppBundle.mockReturnValue({
      failed: false,
      data: { component: App, providerProps: {} },
    });

    const { sendMessage } = setupSettings();
    render(<DataAppEmbed store={store} />);

    await userEvent.click(screen.getByRole("button", { name: "Order 42" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "metabase.embed.dataAppPathChange",
      // the query is reported as it appears in the url, not re-encoded
      data: { path: "sales/orders/42?tab=a%20b&flag#notes" },
    });
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

  it.each(["sales/../other-app/secret", "", "other-app"])(
    "navigates to path again instead of a request that does not name this app: %j",
    (requestedPath) => {
      window.history.replaceState(null, "", "/embed/embedded-apps/sales");
      const initialProps: { navigationRequest: { path: string } | null } = {
        navigationRequest: null,
      };

      const { rerender } = renderHook(
        ({ navigationRequest }) =>
          useDataAppPathNavigation({
            slug: "sales",
            path: "sales/orders",
            navigationRequest,
          }),
        { initialProps },
      );

      // simulates in-app navigation
      act(() => navigate("/products"));

      rerender({ navigationRequest: { path: requestedPath } });

      expect(window.location.pathname).toBe(
        "/embed/embedded-apps/sales/orders",
      );
    },
  );

  it("reports the ID of the last navigation request it handled", () => {
    const onPathChange = jest.fn<void, [string, number | undefined]>();
    const initialProps: {
      navigationRequest: { path: string; navigationId?: number } | null;
    } = { navigationRequest: null };

    const { rerender } = renderHook(
      ({ navigationRequest }) =>
        useDataAppPathNavigation({
          slug: "sales",
          path: "sales",
          navigationRequest,
          onPathChange,
        }),
      { initialProps },
    );

    act(() => navigate("/orders"));
    expect(onPathChange).toHaveBeenLastCalledWith("sales/orders", undefined);

    rerender({
      navigationRequest: { path: "sales/products", navigationId: 3 },
    });
    expect(window.location.pathname).toBe(
      "/embed/embedded-apps/sales/products",
    );
    expect(onPathChange).toHaveBeenCalledTimes(1);

    act(() => navigate("/customers"));
    expect(onPathChange).toHaveBeenLastCalledWith("sales/customers", 3);
  });

  it("reports the app root as the bare slug", () => {
    window.history.replaceState(null, "", "/embed/embedded-apps/sales/orders");
    const { onPathChange } = setupPathNavigation({ path: "sales/orders" });

    act(() => navigate("/"));

    expect(onPathChange).toHaveBeenCalledWith("sales", undefined);
  });

  it("does not report navigation that leaves the app", () => {
    const { onPathChange } = setupPathNavigation({ path: "sales" });

    act(() => navigate("/../other-app/foo"));

    expect(window.location.pathname).toBe("/embed/embedded-apps/other-app/foo");
    expect(onPathChange).not.toHaveBeenCalled();
  });
});

function setupPathNavigation({ path }: { path: string }) {
  const onPathChange = jest.fn<void, [string, number | undefined]>();

  const view = renderHook(
    ({ path }) =>
      useDataAppPathNavigation({ slug: "sales", path, onPathChange }),
    { initialProps: { path } },
  );

  return { ...view, onPathChange };
}
