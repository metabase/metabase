import userEvent from "@testing-library/user-event";

import {
  setupGsheetsGetFolderEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { reloadSettings } from "metabase/admin/settings/settings";
import { useDispatch } from "metabase/lib/redux";
import type { Settings } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GsheetsSyncStatus } from "./GsheetsSyncStatus";

type GsheetsStatus = Settings["gsheets"]["status"];

function TestComponent() {
  const dispatch = useDispatch();
  return (
    <>
      <GsheetsSyncStatus />
      <button onClick={() => dispatch(reloadSettings())}>
        Test Settings Update
      </button>
    </>
  );
}

const setup = ({
  settingStatus,
  updatedSettingStatus,
  folderStatus,
  isAdmin = true,
  errorCode,
}: {
  settingStatus: GsheetsStatus;
  updatedSettingStatus?: GsheetsStatus;
  folderStatus: GsheetsStatus;
  isAdmin?: boolean;
  errorCode?: number;
}) => {
  const updatedSettings = createMockSettings({
    gsheets: {
      status: updatedSettingStatus ?? settingStatus,
      folder_url: null,
    },
  });

  setupPropertiesEndpoints(updatedSettings);
  setupSettingsEndpoints([]);

  errorCode
    ? setupGsheetsGetFolderEndpoint({ errorCode })
    : setupGsheetsGetFolderEndpoint({ status: folderStatus });

  return renderWithProviders(<TestComponent />, {
    storeInitialState: {
      settings: createMockSettingsState({
        gsheets: {
          status: settingStatus,
          folder_url: null,
        },
      }),
      currentUser: createMockUser({ is_superuser: isAdmin }),
    },
  });
};

describe("GsheetsSyncStatus", () => {
  it("should not render anything in not-connected state", () => {
    setup({
      settingStatus: "not-connected",
      folderStatus: "not-connected",
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should appear when status changes from not-connected to loading", async () => {
    setup({
      settingStatus: "not-connected",
      updatedSettingStatus: "loading",
      folderStatus: "loading",
    });

    // initial state
    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();

    // trigger settings update
    userEvent.click(await screen.findByText("Test Settings Update"));

    // loading state
    expect(
      await screen.findByText("Importing Google Sheets..."),
    ).toBeInTheDocument();
  });

  it("should not render anything for non-admins", () => {
    setup({
      settingStatus: "loading",
      folderStatus: "loading",
      isAdmin: false,
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should not render anything when initial state is complete", () => {
    setup({
      settingStatus: "complete",
      folderStatus: "complete",
    });

    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
  });

  it("should render loading state", () => {
    setup({
      settingStatus: "loading",
      folderStatus: "loading",
    });

    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();
  });

  it("should close when the X is clicked", async () => {
    setup({
      settingStatus: "loading",
      folderStatus: "loading",
    });

    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();

    userEvent.click(await screen.findByLabelText("Dismiss"));
    await waitFor(() =>
      expect(screen.queryByText(/Google/i)).not.toBeInTheDocument(),
    );
  });

  it("should render completed state after initial status is loading", async () => {
    setup({
      settingStatus: "loading",
      folderStatus: "complete",
    });

    // initial loading state
    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();

    // complete state
    expect(
      await screen.findByText("Imported Google Sheets"),
    ).toBeInTheDocument();

    screen.getByText("Start exploring");
    screen.getByText("Files sync every 15 minutes");
  });

  it("should show errors", async () => {
    setup({
      settingStatus: "loading",
      folderStatus: "loading",
      errorCode: 500,
    });

    // initial loading state
    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();

    // error state
    expect(
      await screen.findByText(/Error importing Google Sheets/),
    ).toBeInTheDocument();
  });

  it("should clear error if the user tries to connect again", async () => {
    setup({
      settingStatus: "loading",
      folderStatus: "not-connected",
      errorCode: 500,
      updatedSettingStatus: "not-connected",
    });

    // initial loading state
    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();

    // not-connected state
    await waitFor(() =>
      expect(screen.queryByText(/Google/i)).not.toBeInTheDocument(),
    );
  });

  it("should disappear if state changes from loading to not-connected without an error", async () => {
    setup({
      settingStatus: "loading",
      folderStatus: "not-connected",
      updatedSettingStatus: "not-connected",
    });

    // initial loading state
    expect(screen.getByText("Importing Google Sheets...")).toBeInTheDocument();

    // not-connected state
    await waitFor(() =>
      expect(screen.queryByText(/Google/i)).not.toBeInTheDocument(),
    );
  });
});
