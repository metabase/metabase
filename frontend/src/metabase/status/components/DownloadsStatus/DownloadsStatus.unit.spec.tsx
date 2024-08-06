import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { downloadDataset } from "metabase/redux/downloads";
import { HIDE_DELAY } from "metabase/status/hooks/use-status-visibility";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";
import type { Dispatch, Download } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { DownloadsStatus } from "./DownloadsStatus";

jest.mock("metabase/lib/dom", () => ({
  ...jest.requireActual("metabase/lib/dom"),
  openSaveDialog: jest.fn(),
}));

const getDownloadDatasetAction = () =>
  downloadDataset({
    opts: {
      type: "csv",
      question: new Question(createMockCard({ id: 1, name: "test card" })),
      result: createMockDataset(),
    },
    id: 1,
  });

interface SetupOpts {
  downloads?: Download[];
}

const setup = ({ downloads = [] }: SetupOpts = {}) => {
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
    fetchMock.restore();
  });

  it("should show and update downloads status", async () => {
    const { store } = setup();
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv?format_rows=false",
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
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv?format_rows=false",
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
    userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("should collapse and expand", async () => {
    const { store } = setup();
    const dispatch = store.dispatch as Dispatch;

    fetchMock.post(
      "http://localhost/api/card/1/query/csv?format_rows=false",
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

    userEvent.click(screen.getByRole("button", { name: "Collapse" }));

    // Shows smaller status without text
    await waitFor(() => {
      expect(
        screen.queryByText("Results for test card"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Download completed, still show smaller status
    expect(await screen.findByLabelText("check icon")).toBeInTheDocument();
    expect(screen.queryByText("test.csv")).not.toBeInTheDocument();

    // Expand by clicking on the smaller status
    userEvent.click(screen.getByRole("status"));

    // Now status shows file names
    expect(await screen.findByText("test.csv")).toBeInTheDocument();
  });
});
