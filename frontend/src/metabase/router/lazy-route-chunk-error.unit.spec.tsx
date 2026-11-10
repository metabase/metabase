import { useEffect } from "react";
import type { RouteObject } from "react-router";

import { act, render, screen, waitFor } from "__support__/ui";
import {
  Outlet,
  RouterProviderMemory,
  navigate,
  useRouteLeaveBlocker,
} from "metabase/router";
import { redirect, reload } from "metabase/utils/dom";

import { CHUNK_WAIT_MS } from "./lazy-page";
import { isChunkLoadError } from "./lazy-route";

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

// The bundler names a request that ran out of time, which the recovery reads to
// tell it apart from one that failed at once.
function chunkLoadTimeout() {
  const error = new Error(
    "Loading chunk 42 failed.\n(timeout: /app/dist/x.js)",
  );
  error.name = "ChunkLoadError";
  return Object.assign(error, { type: "timeout" });
}

/**
 * A request that fails only after the router has given up waiting for it, which
 * is the window `withChunkFallback` opens. It uses a timeout, the one failure
 * the recovery does not retry, so the whole wait is spent inside one request.
 */
function failsAfterTheWait() {
  return jest.fn(
    () =>
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(chunkLoadTimeout()), CHUNK_WAIT_MS + 200),
      ),
  );
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
      loadingFallback={<span data-testid="loading">loading</span>}
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

    act(() => {
      navigate("/split");
    });

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

    act(() => {
      navigate("/split");
    });

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/split"), {
      timeout: 5000,
    });
    expect(load).toHaveBeenCalledTimes(5);
  });

  // A timed-out request has already spent `output.chunkLoadTimeout`, two
  // minutes by default. Four more of those is a quarter of an hour of nothing.
  it("recovers without retrying when the request ran out of time", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadTimeout());

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      navigate("/split");
    });

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/split"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  // Once the location has committed there is no pending navigation to read a
  // destination from, and none is needed: the URL in the bar is already the
  // destination, so loading the page again lands on it.
  it("loads the committed destination when the failure outlasts the wait", async () => {
    const load = failsAfterTheWait();

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      navigate("/split");
    });

    // The wait runs out first: the page being left is gone and the loading
    // fallback stands in its place.
    expect(
      await screen.findByTestId("loading", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  // A chunk that cannot be fetched because the connection is gone looks exactly
  // like one a deploy removed, and loading the page again would replace a
  // working app with the browser's offline page.
  it("shows the error page rather than loading again while offline", async () => {
    const onLine = jest
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      navigate("/split");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    onLine.mockRestore();
  });

  // Committing a location into a document that is leaving buys nothing, and the
  // page being left is better to look at than a fallback for a page that will
  // never render.
  it("keeps the page being left on screen while the page load runs", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadTimeout());

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      navigate("/split");
    });

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/split"));

    // Past the point where the wait would otherwise have run out.
    await expect(
      screen.findByTestId("loading", undefined, {
        timeout: CHUNK_WAIT_MS + 500,
      }),
    ).rejects.toThrow();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  // The browser acts on a full page load at once, so a document still here
  // afterwards was kept: an unload prompt answered with Stay, or a load the
  // browser refused. Leaving the route empty would strand the user there.
  it("shows the error page when the page load it asked for does not happen", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadTimeout());

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();

    act(() => {
      navigate("/split");
    });

    // `redirect` is mocked, so this document stays, which is what a cancelled
    // load leaves behind.
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/split"));
    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("shows the error page instead of loading again within the interval", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    const view = renderRoutesWithFallback(homeAndSplit(load), "/");
    act(() => {
      navigate("/split");
    });
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    });
    view.unmount();

    renderRoutesWithFallback(homeAndSplit(load), "/");
    expect(await screen.findByTestId("home")).toBeInTheDocument();
    act(() => {
      navigate("/split");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

/**
 * The recovery wraps each `lazy`, and the chunk wait caches the component it
 * stands up against the wrapper it is handed. A wrapper per route would give
 * each of the dozen query builder routes a component type of its own, and
 * react-router renders `route.Component` without a key.
 */
describe("routes that share a chunk", () => {
  it("keep one mount across them", async () => {
    const mount = jest.fn();

    function CountedPage() {
      useEffect(() => mount(), []);
      return <span data-testid="split">split</span>;
    }

    const load = jest.fn(async () => ({ Component: CountedPage }));
    renderRoutesWithFallback(
      [
        { path: "/one", lazy: load },
        { path: "/two", lazy: load },
      ],
      "/one",
    );
    expect(await screen.findByTestId("split")).toBeInTheDocument();

    await act(async () => {
      navigate("/two");
    });

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
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

  // The router commits a slow chunk's location without waiting for the chunk, so
  // the navigation the recovery answers for can be over before the request
  // fails. The destination and the guards' answer are read before that.
  it("keeps the page mounted when the failure outlasts the wait", async () => {
    const load = failsAfterTheWait();

    renderRoutesWithFallback(routes(load), "/doc");
    expect(await screen.findByTestId("editor")).toBeInTheDocument();

    act(() => {
      navigate("/doc/comments");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toHaveTextContent("dirty");
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  // A guard decides on where it is being sent, so the question has to carry the
  // destination even once the router has committed it. A guard asked about the
  // page it is already on answers for the wrong navigation.
  // A page that holds unsaved work still lets a navigation inside itself
  // through, which is how a sidesheet or a tab opens without a prompt. A full
  // page load is not one of those, so that exemption must not answer for it.
  it("asks the guards about leaving, not about the destination they exempt", async () => {
    function WatchfulEditor() {
      useRouteLeaveBlocker(
        ({ nextLocation }) => nextLocation.pathname !== "/doc/comments",
      );
      return (
        <div>
          <span data-testid="editor">editor</span>
          <Outlet />
        </div>
      );
    }

    const load = failsAfterTheWait();
    renderRoutesWithFallback(
      [
        {
          path: "/doc",
          element: <WatchfulEditor />,
          children: [
            { index: true, element: <span data-testid="doc">doc</span> },
            { path: "comments", lazy: load },
          ],
        },
      ],
      "/doc",
    );
    expect(await screen.findByTestId("editor")).toBeInTheDocument();

    act(() => {
      navigate("/doc/comments");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toHaveTextContent("dirty");
    expect(reload).not.toHaveBeenCalled();
  });

  // The error is this route's component only for as long as the route is open.
  // A deploy that was mid-rollout has usually finished by the next visit, and a
  // route that never asks again shows the error for the rest of the session.
  it("asks for the chunk again the next time the route is opened", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(chunkLoadTimeout())
      .mockResolvedValue({ Component: Split });

    renderRoutesWithFallback(routes(load), "/doc");
    expect(await screen.findByTestId("editor")).toBeInTheDocument();

    act(() => {
      navigate("/doc/comments");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toHaveTextContent("dirty");
    expect(load).toHaveBeenCalledTimes(1);

    act(() => {
      navigate("/doc");
    });
    expect(await screen.findByTestId("doc")).toBeInTheDocument();

    act(() => {
      navigate("/doc/comments");
    });

    expect(await screen.findByTestId("split")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the page mounted rather than replacing it", async () => {
    const load = jest.fn().mockRejectedValue(chunkLoadError());

    renderRoutesWithFallback(routes(load), "/doc");
    expect(await screen.findByTestId("editor")).toBeInTheDocument();

    act(() => {
      navigate("/doc/comments");
    });

    expect(
      await screen.findByTestId("chunk-error", undefined, { timeout: 5000 }),
    ).toHaveTextContent("dirty");
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
