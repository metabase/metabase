import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupGdriveGetFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import type { GdrivePayload } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GdriveSyncStatus } from "./GdriveSyncStatus";

function TestComponent() {
  const dispatch = useDispatch();
  const refresh = () => {
    dispatch(EnterpriseApi.util.invalidateTags(["gsheets-status"]));
  };

  useListDatabasesQuery(); // simulate user browsing the database page
  useListTablesQuery();

  return (
    <>
      <GdriveSyncStatus />
      <button onClick={refresh}>Test Settings Update</button>
    </>
  );
}

const USER_ID = 2;

const setup = ({
  initialFolderPayload,
  isAdmin = true,
  errorCode,
}: {
  initialFolderPayload?: GdrivePayload;
  isAdmin?: boolean;
  errorCode?: number;
}) => {
  const settings = createMockSettings({
    "show-google-sheets-integration": true,
    "token-features": createMockTokenFeatures({
      attached_dwh: true,
    }),
  });

  setupGdriveGetFolderEndpoint({
    errorCode,
    created_by_id: USER_ID,
    ...initialFolderPayload,
  });
  setupGdriveServiceAccountEndpoint(
    "test-service-account@service-account.metabase.com",
  );

  setupDatabaseListEndpoint([]);
  setupTablesEndpoints([]);

  return renderWithProviders(<TestComponent />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
      currentUser: createMockUser({ id: USER_ID, is_superuser: isAdmin }),
    },
  });
};

describe("GsheetsSyncStatus", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should not render anything in not-connected state", () => {
    setup({
      initialFolderPayload: { status: "not-connected" },
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should appear when status changes from not-connected to loading", async () => {
    setup({
      initialFolderPayload: { status: "not-connected" },
    });

    // initial state
    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      status: "syncing",
      created_by_id: USER_ID,
    });

    // trigger settings update
    await userEvent.click(await screen.findByText("Test Settings Update"));

    // loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();
  });

  it("should not render anything for non-admins", () => {
    setup({
      initialFolderPayload: { status: "syncing", created_by_id: USER_ID },
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should not render anything when initial state is active", () => {
    setup({
      initialFolderPayload: { status: "active" },
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should render loading state", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();
  });

  it("should close when the X is clicked", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByLabelText("Dismiss"));
    await waitFor(() =>
      expect(screen.queryByText(/Google/i)).not.toBeInTheDocument(),
    );
  });

  it("should render completed state after initial status is loading", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    // initial loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      status: "active",
      db_id: 1,
      created_by_id: USER_ID,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    // complete state
    expect(
      await screen.findByText("Imported Google Sheets"),
    ).toBeInTheDocument();

    screen.getByText("Start exploring");
    screen.getByText("Files sync every 15 minutes");
  });

  it("should refetch tables when sync completes (UXW-311)", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });
    fetchMock.get(`path:/api/database`, []);
    fetchMock.get(`path:/api/table`, []);

    setupGdriveGetFolderEndpoint({
      status: "active",
      db_id: 1,
      created_by_id: USER_ID,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(fetchMock.callHistory.called("/api/database")).toBe(true);
    expect(fetchMock.callHistory.called("/api/table")).toBe(true);
  });

  it("should show error from error response", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    // initial loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      errorCode: 500,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    // error state
    expect(
      await screen.findByText(/Error importing Google Sheets/),
    ).toBeInTheDocument();
  });

  it("should show from error status", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    // initial loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      status: "error",
      created_by_id: USER_ID,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    // error state
    expect(
      await screen.findByText(/Error importing Google Sheets/),
    ).toBeInTheDocument();
  });

  it("should clear error if the user tries to connect again", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    // initial syncing state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      errorCode: 500,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    // error display
    expect(
      await screen.findByText("Error importing Google Sheets"),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      status: "syncing",
      created_by_id: USER_ID,
    });

    // trigger settings update
    await userEvent.click(await screen.findByText("Test Settings Update"));

    // syncing state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();
  });

  it("should disappear if state changes from syncing to not-connected without an error", async () => {
    setup({
      initialFolderPayload: { status: "syncing" },
    });

    // initial loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();

    setupGdriveGetFolderEndpoint({
      status: "not-connected",
      created_by_id: USER_ID,
    });

    await act(() => {
      jest.advanceTimersByTime(3000);
    });

    // not-connected state
    await waitFor(() =>
      expect(screen.queryByText(/Google/i)).not.toBeInTheDocument(),
    );
  });

  it("should not show the sync component if the user did not connect the folder", async () => {
    setup({
      initialFolderPayload: { status: "syncing", created_by_id: 99 },
    });

    await screen.findByText("Test Settings Update");

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });
});
