import {
  setupGsheetsGetFolderEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Settings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GsheetsSyncStatus } from "./GsheetsSyncStatus";
type GsheetsStatus = Settings["gsheets"]["status"];

const setup = ({
  settingStatus,
  folderStatus,
}: {
  settingStatus: GsheetsStatus;
  folderStatus: GsheetsStatus;
}) => {
  const updatedSettings = createMockSettings({
    gsheets: { status: settingStatus, folder_url: null },
  });

  setupPropertiesEndpoints(updatedSettings);
  setupSettingsEndpoints([]);
  setupGsheetsGetFolderEndpoint(folderStatus);

  return renderWithProviders(<GsheetsSyncStatus />, {
    storeInitialState: {
      settings: createMockSettingsState({
        gsheets: { status: settingStatus, folder_url: null },
      }),
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
  });
});
