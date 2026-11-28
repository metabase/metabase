import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { downloadDataset } from "metabase/redux/downloads";
import type { Dispatch, DownloadsState } from "metabase/redux/store";
import { HIDE_DELAY } from "metabase/status/hooks/use-status-visibility";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { DownloadsStatus } from "./DownloadsStatus";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

jest.mock("metabase/utils/iframe", () => ({
  ...jest.requireActual("metabase/utils/iframe"),
  // For some reason, this is undefined. I think it's because we're requiring while mocking, but
  // It's unclear.
  isWithinIframe: () => false,
}));

const getDownloadDatasetAction = () =>
  downloadDataset({
    opts: {
      type: "csv",
      question: new Question(
        createMockCard({ id: 1, name: "test card" }),
        createMockMetadata(),
      ),
      result: createMockDataset(),
    },
    id: 1,
  });

// jsdom's fetch polyfill can't stream a body, so reject the read the way a
// browser does when the server aborts the connection mid-stream. fetch-mock
// clones the Response it is given, so the clone must keep the rejection.
class AbortedStreamResponse extends Response {
  blob(): Promise<Blob> {
    return Promise.reject(new TypeError("network error"));
  }

  clone(): Response {
    return this;
  }
}

interface SetupOpts {
  downloads?: DownloadsState;
}

const setup = ({
  downloads = {
    datasetRequests: [],
    isDownloadingToImage: false,
  },
}: SetupOpts = {}) => {
  const state = createMockState({
    downloads,
  });

  return renderWithProviders(<DownloadsStatus />, {
    storeInitialState: state,
  });
};

describe("DownloadsStatus", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should show and update downloads status", async () => {
    const { store } = setup();
    // Unjustified type cast. FIXME
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv",
      {
        headers: { "Content-Disposition": 'filename="test.csv"' },
      },
      { delay: 500 },
    );

    // Initially shows nothing
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Download starts
    await act(async () => {
      dispatch(getDownloadDatasetAction());
    });

    expect(screen.getByText("Downloading…")).toBeInTheDocument();
    expect(screen.getByText("Results for test card")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Download competed
    expect(await screen.findByText("test.csv")).toBeInTheDocument();

    // Wait until the status should automatically hide
    act(() => {
      jest.advanceTimersByTime(HIDE_DELAY);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should show and update downloads status when errored", async () => {
    const { store } = setup();
    // Unjustified type cast. FIXME
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv",
      {
        throws: new Error("Network error"),
      },
      { delay: 500 },
    );

    // Initially shows nothing
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Download starts
    await act(async () => {
      dispatch(getDownloadDatasetAction());
    });

    expect(screen.getByText("Downloading…")).toBeInTheDocument();
    expect(screen.getByText("Results for test card")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Download errored
    expect(await screen.findByText("Network error")).toBeInTheDocument();

    // Errors do not hide automatically
    act(() => {
      jest.advanceTimersByTime(HIDE_DELAY);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    // Dismiss the error
    const dismissPromise = userEvent.click(
      screen.getByRole("button", { name: "Dismiss" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    await dismissPromise;
  });

  it("should show a download error when the stream is aborted mid-download", async () => {
    const { store } = setup();
    // The store is created by renderWithProviders and dispatches thunks at runtime
    const dispatch = store.dispatch as Dispatch;

    const abortedResponse = new AbortedStreamResponse("v\n1\n2\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'filename="test.csv"',
      },
    });
    fetchMock.post(
      "http://localhost/api/card/1/query/csv",
      () => abortedResponse,
      { delay: 500 },
    );

    await act(async () => {
      dispatch(getDownloadDatasetAction());
    });

    expect(screen.getByText("Downloading…")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(await screen.findByText("Download error")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The download was interrupted and the file may be incomplete. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Download completed")).not.toBeInTheDocument();
    expect(screen.queryByText("test.csv")).not.toBeInTheDocument();
  });

  it("should collapse and expand", async () => {
    const { store } = setup();
    // Unjustified type cast. FIXME
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv",
      {
        headers: { "Content-Disposition": 'filename="test.csv"' },
      },
      { delay: 500 },
    );

    // Initially shows nothing
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Download starts
    await act(async () => {
      dispatch(getDownloadDatasetAction());
    });

    expect(screen.getByText("Results for test card")).toBeInTheDocument();

    const collapsePromise = userEvent.click(
      screen.getByRole("button", { name: "Collapse" }),
    );

    // Shows smaller status without text
    await waitFor(() => {
      expect(
        screen.queryByText("Results for test card"),
      ).not.toBeInTheDocument();
    });
    await collapsePromise;
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Download completed, still show smaller status
    expect(await screen.findByLabelText("check icon")).toBeInTheDocument();
    expect(screen.queryByText("test.csv")).not.toBeInTheDocument();

    // Expand by clicking on the smaller status
    const expandPromise = userEvent.click(screen.getByRole("status"));

    // Now status shows file names
    expect(await screen.findByText("test.csv")).toBeInTheDocument();
    await expandPromise;
  });
});
