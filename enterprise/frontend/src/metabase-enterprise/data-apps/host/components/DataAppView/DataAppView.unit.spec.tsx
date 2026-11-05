import { act } from "@testing-library/react";

import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type * as DomUtils from "metabase/utils/dom";
import { replaceLocation } from "metabase/utils/dom";
import { useGetDataAppQuery } from "metabase-enterprise/api";
import type { Settings } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import {
  DATA_APP_ERROR_MESSAGE_TYPE,
  DATA_APP_LOAD_TIMEOUT_MS,
  DATA_APP_READY_MESSAGE_TYPE,
  DATA_APP_ROUTE_MESSAGE_TYPE,
} from "../../../constants";
import type * as GetOriginMismatch from "../../lib/get-origin-mismatch";
import { getOriginMismatch } from "../../lib/get-origin-mismatch";

import { DataAppView } from "./DataAppView";

jest.mock("metabase-enterprise/api", () => ({
  ...jest.requireActual("metabase-enterprise/api"),
  useGetDataAppQuery: jest.fn(),
}));

// jsdom always runs on a loopback origin, so a page on another host name is stubbed.
jest.mock("../../lib/get-origin-mismatch", () => {
  const actual = jest.requireActual<typeof GetOriginMismatch>(
    "../../lib/get-origin-mismatch",
  );
  return { getOriginMismatch: jest.fn(actual.getOriginMismatch) };
});

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual<typeof DomUtils>("metabase/utils/dom"),
  replaceLocation: jest.fn(),
}));

const { getOriginMismatch: actualGetOriginMismatch } = jest.requireActual<
  typeof GetOriginMismatch
>("../../lib/get-origin-mismatch");

const mockedGetApp = jest.mocked(useGetDataAppQuery);
const mockedGetOriginMismatch = jest.mocked(getOriginMismatch);
const mockedReplaceLocation = jest.mocked(replaceLocation);

const ISOLATED_ORIGIN = "https://apps.example.com";
const ISOLATED_ORIGIN_SETTINGS: Partial<Settings> = {
  "isolated-origin": ISOLATED_ORIGIN,
  // The page's own origin, so the loopback-origin redirect stays put.
  "site-url": window.location.origin,
};

type SetupOpts = {
  name?: string;
  data?: ReturnType<typeof createMockDataApp>;
  isLoading?: boolean;
  error?: unknown;
  enableDrafts?: boolean;
  enableUrlMirroring?: boolean;
  settings?: Partial<Settings>;
};

function setup({
  name = "sales",
  data,
  isLoading = false,
  error,
  enableDrafts,
  enableUrlMirroring,
  settings,
}: SetupOpts = {}) {
  // RTK Query's hook result is a wide discriminated union (refetch, status,
  // isFetching, …); the component reads only these three fields.
  mockedGetApp.mockReturnValue({
    data,
    isLoading,
    error,
  } as unknown as ReturnType<typeof useGetDataAppQuery>);

  renderWithProviders(
    <>
      {/* The empty-name case has no `:name` segment to match. */}
      <Route
        path="/"
        element={
          <DataAppView
            enableDrafts={enableDrafts}
            enableUrlMirroring={enableUrlMirroring}
          />
        }
      />
      <Route
        path=":name"
        element={
          <DataAppView
            enableDrafts={enableDrafts}
            enableUrlMirroring={enableUrlMirroring}
          />
        }
      />
    </>,
    {
      withRouter: true,
      initialRoute: `/${name}`,
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
      }),
    },
  );
}

describe("DataAppView", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows a not-found screen when the name is empty", () => {
    setup({ name: "" });

    expect(screen.getByText("Data app not found")).toBeInTheDocument();
  });

  it("shows a not-found screen when the app 404s (disabled or missing)", () => {
    setup({ error: { status: 404 } });

    expect(screen.getByText("Data app not found")).toBeInTheDocument();
  });

  it("shows a not-found screen when an admin opens a disabled app", () => {
    setup({ data: createMockDataApp({ enabled: false }) });

    expect(screen.getByText("Data app not found")).toBeInTheDocument();
  });

  it("shows a disabled app when drafts are allowed", () => {
    setup({ data: createMockDataApp({ enabled: false }), enableDrafts: true });

    expect(screen.queryByText("Data app not found")).not.toBeInTheDocument();
  });

  it("shows a generic error screen for an unexpected failure", async () => {
    setup({ error: { status: 500 } });

    expect(
      await screen.findByText("Couldn’t load this data app"),
    ).toBeInTheDocument();
  });

  it("shows a permission error when the user cannot access the data app", () => {
    setup({ error: { status: 403 } });

    expect(
      screen.getByText("You don’t have access to this data app"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Ask an administrator for access to this data app."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Show error details")).not.toBeInTheDocument();

    expect(
      screen.queryByText("Gather diagnostic information"),
    ).not.toBeInTheDocument();
  });

  it("shows the API's outdated message when the app 409s with the outdated error code", () => {
    setup({
      error: {
        status: 409,
        data: {
          "error-code": "data-app-outdated",
          message: "This app was built for version 1 of data apps.",
        },
      },
    });

    expect(screen.getByText("This data app is outdated")).toBeInTheDocument();
    expect(
      screen.getByText("This app was built for version 1 of data apps."),
    ).toBeInTheDocument();
  });

  it("shows the outdated screen to an admin, who still receives the app's metadata", () => {
    setup({ data: createMockDataApp({ version: 1, outdated: true }) });

    expect(screen.getByText("This data app is outdated")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This app was built for version 1 of data apps. Migrate it to the current version, then rebuild and sync it again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Sales")).not.toBeInTheDocument();
  });

  it("says at once that data apps are off when MB_ISOLATED_ORIGIN can't be used, instead of waiting for the load timeout", () => {
    setup({
      data: createMockDataApp({ display_name: "Sales" }),
      settings: {
        "isolated-origin": null,
        "isolated-origin-misconfigured?": true,
      },
    });

    expect(screen.getByText("Data apps are unavailable")).toBeInTheDocument();
    expect(screen.getByText(/MB_ISOLATED_ORIGIN/)).toBeInTheDocument();
    expect(screen.queryByTitle("Sales")).not.toBeInTheDocument();
  });

  it("renders the app inside an iframe once metadata resolves", () => {
    setup({ data: createMockDataApp({ display_name: "Sales" }) });

    const iframe = screen.getByTitle("Sales");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "/embed/apps/sales");
    // Cross-origin iframes lose the default clipboard permission; delegate it.
    expect(iframe).toHaveAttribute("allow", "clipboard-write");
  });

  /** Post a `message` event as if it came from `source`. */
  function postMessage(
    source: MessageEventSource | null,
    data: unknown,
    origin: string = window.location.origin,
  ) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data, source, origin }),
      );
    });
  }

  function setupIframe({ settings }: Pick<SetupOpts, "settings"> = {}) {
    setup({ data: createMockDataApp({ display_name: "Sales" }), settings });
    return screen.getByTitle<HTMLIFrameElement>("Sales");
  }

  it("shows the not-ready screen when the iframe reports it has no bundle yet", () => {
    const iframe = setupIframe();

    postMessage(iframe.contentWindow, {
      type: DATA_APP_ERROR_MESSAGE_TYPE,
      notReady: true,
    });

    expect(
      screen.getByText("This data app isn’t ready yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This app has no bundle yet\. Build it and push it/),
    ).toBeInTheDocument();
  });

  it("shows the themed error screen with the reported message when the iframe's bundle crashes", () => {
    const iframe = setupIframe();

    postMessage(iframe.contentWindow, {
      type: DATA_APP_ERROR_MESSAGE_TYPE,
      notReady: false,
      message: "kaboom",
    });

    expect(
      screen.getByText("This data app couldn’t be loaded"),
    ).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("ignores error messages that aren't from its own iframe", () => {
    setupIframe();

    // A look-alike message from a different window must not trigger the error UI.
    postMessage(window, { type: DATA_APP_ERROR_MESSAGE_TYPE, notReady: true });

    expect(
      screen.queryByText("This data app isn’t ready yet"),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("Sales")).toBeInTheDocument();
  });

  it("ignores messages from another origin, even sent through its own frame", () => {
    const iframe = setupIframe();

    postMessage(
      iframe.contentWindow,
      { type: DATA_APP_ERROR_MESSAGE_TYPE, notReady: true },
      "https://not-metabase.example.com",
    );

    expect(
      screen.queryByText("This data app isn’t ready yet"),
    ).not.toBeInTheDocument();
  });

  describe("loading overlay", () => {
    it("covers the frame until the app reports it's on screen", () => {
      const iframe = setupIframe();

      expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();

      postMessage(iframe.contentWindow, { type: DATA_APP_READY_MESSAGE_TYPE });

      expect(screen.queryByTestId("data-app-loading")).not.toBeInTheDocument();
    });

    it("stays up on the iframe's load event alone — that fires before the bundle renders", () => {
      const iframe = setupIframe();

      // The frame's document is parsed, but the bundle hasn't been fetched,
      // sandboxed or drawn yet. Lifting the overlay here is what caused the
      // white flash, so `load` must not dismiss it.
      act(() => {
        iframe.dispatchEvent(new Event("load"));
      });

      expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();
    });

    it("ignores a ready message that isn't from its own iframe", () => {
      setupIframe();

      postMessage(window, { type: DATA_APP_READY_MESSAGE_TYPE });

      expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();
    });
  });

  describe("load failure", () => {
    /** Dispatch a `securitypolicyviolation` as if the browser blocked framing. */
    function dispatchFrameSrcViolation(blockedURI: string) {
      // jsdom has no `SecurityPolicyViolationEvent` constructor, so build a plain
      // Event and attach the two fields the handler reads.
      const event = new Event(
        "securitypolicyviolation",
      ) as SecurityPolicyViolationEvent;
      Object.assign(event, { effectiveDirective: "frame-src", blockedURI });
      act(() => {
        document.dispatchEvent(event);
      });
    }

    it("shows an error instead of spinning when framing is blocked by CSP", async () => {
      setupIframe();
      expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();

      dispatchFrameSrcViolation(window.location.origin);

      expect(
        screen.getByText("Couldn’t load this data app"),
      ).toBeInTheDocument();
      await screen.findByText("Show error details");
    });

    it("ignores CSP violations for other frames", () => {
      setupIframe();

      dispatchFrameSrcViolation("https://not-the-isolated-origin.example.com");

      expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();
    });

    describe("served from a separate isolated origin", () => {
      it("shows an error when framing the isolated origin is blocked by CSP", async () => {
        setupIframe({ settings: ISOLATED_ORIGIN_SETTINGS });

        dispatchFrameSrcViolation("https://apps.example.com/embed/apps/sales");

        expect(
          screen.getByText("Couldn’t load this data app"),
        ).toBeInTheDocument();
        await screen.findByText("Show error details");
      });

      it("ignores a CSP violation for a frame on the page's own origin", () => {
        setupIframe({ settings: ISOLATED_ORIGIN_SETTINGS });

        dispatchFrameSrcViolation(window.location.origin);

        expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();
      });
    });

    it("shows an error when the iframe never signals it loaded", async () => {
      jest.useFakeTimers();
      try {
        setupIframe();
        expect(screen.getByTestId("data-app-loading")).toBeInTheDocument();

        act(() => {
          jest.advanceTimersByTime(DATA_APP_LOAD_TIMEOUT_MS);
        });

        expect(
          screen.getByText("Couldn’t load this data app"),
        ).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
      await screen.findByText("Show error details");
    });

    it("does not error once the app reports ready before the timeout", () => {
      jest.useFakeTimers();
      try {
        const iframe = setupIframe();

        postMessage(iframe.contentWindow, {
          type: DATA_APP_READY_MESSAGE_TYPE,
        });

        act(() => {
          jest.advanceTimersByTime(DATA_APP_LOAD_TIMEOUT_MS);
        });

        expect(
          screen.queryByText("Couldn’t load this data app"),
        ).not.toBeInTheDocument();
        expect(screen.getByTitle("Sales")).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps the first error's reason — the timeout can't overwrite the CSP one", async () => {
      jest.useFakeTimers();
      try {
        setupIframe();

        dispatchFrameSrcViolation(window.location.origin);

        act(() => {
          jest.advanceTimersByTime(DATA_APP_LOAD_TIMEOUT_MS);
        });

        // The specific CSP detail survives; the generic timeout copy never appears.
        expect(
          screen.getByText(/content security policy/i),
        ).toBeInTheDocument();
        expect(
          screen.queryByText(/frame may be unreachable/i),
        ).not.toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
      await screen.findByText("Show error details");
    });
  });

  describe("served from a separate isolated origin", () => {
    const settings = ISOLATED_ORIGIN_SETTINGS;

    afterEach(() => {
      window.history.replaceState({}, "", "/");
      mockedGetOriginMismatch.mockImplementation(actualGetOriginMismatch);
      mockedReplaceLocation.mockClear();
    });

    it("mirrors the route the app reports into the page URL", () => {
      setup({
        data: createMockDataApp({ display_name: "Sales" }),
        enableUrlMirroring: true,
        settings,
      });
      const iframe = screen.getByTitle<HTMLIFrameElement>("Sales");

      postMessage(
        iframe.contentWindow,
        {
          type: DATA_APP_ROUTE_MESSAGE_TYPE,
          path: "/embed/apps/sales/orders/42",
        },
        ISOLATED_ORIGIN,
      );

      expect(window.location.pathname).toBe("/apps/sales/orders/42");
    });

    it("ignores a route report from another origin", () => {
      setup({
        data: createMockDataApp({ display_name: "Sales" }),
        enableUrlMirroring: true,
        settings,
      });
      const iframe = screen.getByTitle<HTMLIFrameElement>("Sales");
      const pathnameBefore = window.location.pathname;

      postMessage(
        iframe.contentWindow,
        {
          type: DATA_APP_ROUTE_MESSAGE_TYPE,
          path: "/embed/apps/sales/orders/42",
        },
        "https://elsewhere.example.com",
      );

      expect(window.location.pathname).toBe(pathnameBefore);
    });

    it("shows a link to the site URL at once on another host name, instead of waiting for the load timeout", () => {
      mockedGetOriginMismatch.mockReturnValue({
        kind: "wrong-origin",
        url: "https://mb.example.com/apps/sales",
      });

      setup({
        data: createMockDataApp({ display_name: "Sales" }),
        settings,
      });

      expect(
        screen.getByRole("link", { name: "Open data app" }),
      ).toHaveAttribute("href", "https://mb.example.com/apps/sales");
      expect(screen.queryByTitle("Sales")).not.toBeInTheDocument();
    });

    it("moves a loopback page to the site URL, without loading the app here first", () => {
      mockedGetOriginMismatch.mockReturnValue({
        kind: "redirect",
        url: "http://mb.localhost:3000/apps/sales",
      });

      setup({
        data: createMockDataApp({ display_name: "Sales" }),
        settings,
      });

      expect(mockedReplaceLocation).toHaveBeenCalledWith(
        "http://mb.localhost:3000/apps/sales",
      );
      expect(screen.queryByTitle("Sales")).not.toBeInTheDocument();
    });
  });
});
