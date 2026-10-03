import type { RouteObject } from "react-router";

import { render, screen, waitFor } from "__support__/ui";
import {
  Outlet,
  RouterProviderMemory,
  isChunkLoadError,
  navigate,
  useRouteLeaveBlocker,
} from "metabase/router";
import { redirect, reload } from "metabase/utils/dom";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  redirect: jest.fn(),
  reload: jest.fn(),
}));

function chunkLoadError() {
  const error = new Error("Loading chunk 42 failed.");
  error.name = "ChunkLoadError";
  return error;
}

function Fallback({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) {
  return (
    <span data-testid="chunk-error">
      {hasUnsavedChanges ? "dirty" : "clean"}
    </span>
  );
}

function Split() {
  return <span data-testid="split">split</span>;
}

function renderRoutesWithFallback(routes: RouteObject[], initialRoute: string) {
  return render(
    <RouterProviderMemory
      routes={routes}
      initialRoute={initialRoute}
      chunkErrorFallback={Fallback}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

describe("isChunkLoadError", () => {
  it("matches a bundler chunk failure", () => {
    expect(isChunkLoadError(chunkLoadError())).toBe(true);
  });

  it("matches a native module fetch failure", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: /app/dist/x.js",
        ),
      ),
    ).toBe(true);
  });

  // A module that throws on evaluation throws again just as reliably, so
  // reloading the page for it would loop rather than recover.
  it("does not match an error thrown by the module itself", () => {
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
  });
});

describe("a route whose chunk fails to load", () => {
  const homeAndSplit = (lazy: RouteObject["lazy"]): RouteObject[] => [
    { path: "/", element: <span data-testid="home">home</span> },
    { path: "/split", lazy },
  ];

  it("retries, and renders the page when a retry succeeds", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(chunkLoadError())
      .mockResolvedValue({ Component: Split });

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    navigate("/split");

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(redirect).not.toHaveBeenCalled();
  });

  // The location is only committed once the module resolves, so at the point of
  // failure `window.location` still holds the page being left. Reloading would
  // put the user back there rather than where they were going.
  it("loads the destination, not the page being left, once retries run out", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    navigate("/split");

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/split"), {
      timeout: 5000,
    });
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("shows the error page instead of loading again within the interval", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    const view = renderRoutesWithFallback(homeAndSplit(load), "/");
    navigate("/split");
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    });
    view.unmount();

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();
    navigate("/split");

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

/**
 * A guard is not consulted for a destination inside its own route, so a page can
 * navigate within itself without being asked about unsaved work. Those
 * navigations reach code-split chunks too, and the user has agreed to nothing.
 */
describe("a chunk that fails while the page holds unsaved work", () => {
  function DirtyEditor() {
    useRouteLeaveBlocker(() => true);
    return (
      <div>
        <span data-testid="editor">editor</span>
        <Outlet />
      </div>
    );
  }

  const routes = (lazy: RouteObject["lazy"]): RouteObject[] => [
    {
      path: "/doc",
      element: <DirtyEditor />,
      children: [
        { index: true, element: <span data-testid="doc">doc</span> },
        { path: "comments", lazy },
      ],
    },
  ];

  it("keeps the page mounted rather than replacing it", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    renderRoutesWithFallback(routes(load), "/doc");
    expect(await screen.findByTestId("editor")).toBeInTheDocument();

    navigate("/doc/comments");

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toHaveTextContent("dirty");
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
