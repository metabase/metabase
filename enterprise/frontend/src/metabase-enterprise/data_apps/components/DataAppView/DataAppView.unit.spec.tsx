import { act } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { useGetDataAppQuery } from "metabase-enterprise/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import {
  DATA_APP_ERROR_MESSAGE_TYPE,
  DATA_APP_READY_MESSAGE_TYPE,
} from "../../constants";

import { DataAppView } from "./DataAppView";

jest.mock("metabase-enterprise/api", () => ({
  ...jest.requireActual("metabase-enterprise/api"),
  useGetDataAppQuery: jest.fn(),
}));

const mockedGetApp = jest.mocked(useGetDataAppQuery);

type SetupOpts = {
  name?: string;
  data?: ReturnType<typeof createMockDataApp>;
  isLoading?: boolean;
  error?: unknown;
};

function setup({
  name = "sales",
  data,
  isLoading = false,
  error,
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
      <Route path="/" element={<DataAppView />} />
      <Route path=":name" element={<DataAppView />} />
    </>,
    { withRouter: true, initialRoute: `/${name}` },
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

  it("shows a generic error screen for an unexpected failure", () => {
    setup({ error: { status: 500 } });

    expect(screen.getByText("Couldn’t load this data app")).toBeInTheDocument();
  });

  it("renders the app inside an iframe once metadata resolves", () => {
    setup({ data: createMockDataApp({ display_name: "Sales" }) });

    const iframe = screen.getByTitle("Sales");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "/embed/apps/sales");
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

  function setupIframe() {
    setup({ data: createMockDataApp({ display_name: "Sales" }) });
    return screen.getByTitle<HTMLIFrameElement>("Sales");
  }

  it("shows the not-ready screen when the iframe reports its bundle hasn't synced", () => {
    const iframe = setupIframe();

    postMessage(iframe.contentWindow, {
      type: DATA_APP_ERROR_MESSAGE_TYPE,
      notReady: true,
    });

    expect(
      screen.getByText("This data app isn’t ready yet"),
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
});
