import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupGdriveGetFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupGdriveSyncEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Settings } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GdriveDbMenu } from "./GdriveDbMenu";

jest.mock("react-use", () => {
  return {
    ...jest.requireActual("react-use"),
    useLocation: jest.fn(() => ({
      pathname: "/databases/11",
    })),
  };
});

type Status = Settings["gsheets"]["status"];

const openMenu = async () => {
  const menu = await screen.findByText("Google Sheets");
  await userEvent.click(menu);
};

const closeMenu = openMenu;

const setup = ({
  status,
  uploadTime,
}: {
  status: Status;
  uploadTime?: number;
}) => {
  setupGdriveGetFolderEndpoint({ status, "folder-upload-time": uploadTime });
  setupGdriveServiceAccountEndpoint();
  setupDatabaseEndpoints(
    createMockDatabase({
      id: 11,
      name: "Data Warehouse DB",
      is_attached_dwh: true,
    }),
  );
  setupGdriveSyncEndpoint();

  return renderWithProviders(<GdriveDbMenu />, {
    // withRouter: true,
    initialRoute: "/databases/11",
    storeInitialState: {
      settings: createMockSettingsState({
        "show-google-sheets-integration": true,
        gsheets: {
          status,
          folder_url: null,
        },
      }),
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("Google Drive > DB Menu", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("shows a connect button when not connected", async () => {
    setup({ status: "not-connected" });

    expect(
      await screen.findByText("Connect Google Sheets"),
    ).toBeInTheDocument();
  });

  it("shows a menu when connected", async () => {
    setup({ status: "complete" });

    expect(await screen.findByText("Google Sheets")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
  });

  it("shows a menu when loading", async () => {
    setup({ status: "loading" });

    expect(await screen.findByText("Google Sheets")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
  });

  it("shows 'Syncing' when loading", async () => {
    setup({ status: "loading" });

    await openMenu();
    expect(await screen.findByText("Syncing")).toBeInTheDocument();
  });

  it("shows a disconnect button when connected", async () => {
    setup({
      status: "complete",
    });

    await openMenu();
    const disconnectButton = await screen.findByRole("menuitem", {
      name: /close icon disconnect/i,
    });
    expect(disconnectButton).toBeEnabled();
  });

  it("disables disconnect button when loading", async () => {
    setup({
      status: "loading",
    });

    await openMenu();
    const disconnectButton = await screen.findByRole("menuitem", {
      name: /close icon disconnect/i,
    });
    expect(disconnectButton).toBeDisabled();
  });

  it("should show last sync time", async () => {
    setup({
      status: "complete",
      uploadTime: dayjs().subtract(3, "minute").unix(),
    });

    await openMenu();

    expect(
      await screen.findByText("Last synced 3 minutes ago"),
    ).toBeInTheDocument();
  });

  it("should show next sync time", async () => {
    setup({
      status: "complete",
      uploadTime: dayjs().subtract(13, "minute").unix(),
    });

    await openMenu();

    expect(
      await screen.findByText("Next sync in 2 minutes"),
    ).toBeInTheDocument();
  });

  it("should show next sync time as soon if the last sync was more than 15 min ago", async () => {
    setup({
      status: "complete",
      uploadTime: dayjs().subtract(20, "minute").unix(),
    });

    await openMenu();
    expect(
      await screen.findByText("Last synced 20 minutes ago"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Next sync soon™")).toBeInTheDocument();
  });

  it("should call the sync API when clicking sync now", async () => {
    setup({ status: "complete" });

    await openMenu();

    const syncButton = await screen.findByRole("menuitem", {
      name: /sync now/i,
    });
    expect(syncButton).toBeEnabled();

    setupGdriveGetFolderEndpoint({
      status: "loading",
      "folder-upload-time": dayjs().subtract(3, "minute").unix(),
    });
    await userEvent.click(syncButton);

    const syncCalls = fetchMock.calls("path:/api/ee/gsheets/folder/sync");
    expect(syncCalls).toHaveLength(1);

    // sync should cause a refetch
    expect(await screen.findByText("Syncing")).toBeInTheDocument();

    closeMenu();
    jest.advanceTimersByTime(6000);
    setupGdriveGetFolderEndpoint({
      status: "complete",
      "folder-upload-time": dayjs().subtract(2, "second").unix(),
    });
    // reopening the menu after 5 seconds should cause refetch
    openMenu();
    await screen.findByText("Last synced a few seconds ago");
  });

  it("should open disconnect modal when clicking disconnect", async () => {
    setup({ status: "complete" });
    await openMenu();
    const disconnectButton = await screen.findByRole("menuitem", {
      name: /close icon disconnect/i,
    });
    expect(disconnectButton).toBeEnabled();
    await userEvent.click(disconnectButton);
    expect(
      screen.getByText(/Disconnect from Google Drive?/i),
    ).toBeInTheDocument();
  });
});
