import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGdrivePostFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Settings } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GdriveConnectionModal } from "./GdriveConnectionModal";
type GsheetsStatus = Settings["gsheets"]["status"];

const setup = ({ settingStatus }: { settingStatus: GsheetsStatus }) => {
  const updatedSettings = createMockSettings({
    "show-google-sheets-integration": true,
    gsheets: {
      status: settingStatus,
      folder_url: null,
    },
  });

  setupPropertiesEndpoints(updatedSettings);
  setupSettingsEndpoints([]);
  setupGdrivePostFolderEndpoint();
  setupGdriveServiceAccountEndpoint(
    "super-service-account@testing.metabase.com",
  );

  return renderWithProviders(
    <GdriveConnectionModal onClose={() => {}} isModalOpen reconnect={false} />,
    {
      storeInitialState: {
        settings: createMockSettingsState({
          gsheets: {
            status: settingStatus,
            folder_url: null,
          },
        }),
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
};

describe("Google Drive > Connect / Disconnect modal", () => {
  it("should show disconnect modal if connected", async () => {
    setup({
      settingStatus: "complete",
    });
    expect(await screen.findByText("Disconnect")).toBeInTheDocument();
  });

  it("should show connection modal if not connected", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();
  });

  it("should show service acocunt email", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    expect(
      await screen.findByText("super-service-account@testing.metabase.com"),
    ).toBeInTheDocument();
  });

  it("should show 'import folder' button when folder is selected", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const folderOption = await screen.findByText("Entire folder");
    await userEvent.click(folderOption);

    expect(await screen.findByText("Import folder")).toBeInTheDocument();
  });

  it("should show 'import file' button when file is selected", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const fileOption = await screen.findByText("Single Sheet");
    await userEvent.click(fileOption);

    expect(await screen.findByText("Import file")).toBeInTheDocument();
  });

  it("should POST folder data to /api/ee/gsheets/folder", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/https/i);
    await userEvent.type(
      input,
      "https://drive.google.com/drive/folders/1234567890",
    );

    const importButton = await screen.findByRole("button", {
      name: /import folder/i,
    });
    await userEvent.click(importButton);

    await waitFor(async () => {
      const post = fetchMock.calls("path:/api/ee/gsheets/folder");
      expect(post.length).toBe(1);
    });

    const post = fetchMock.calls("path:/api/ee/gsheets/folder");
    const postBody = await post?.[0]?.[1]?.body;
    expect(postBody).toEqual(
      JSON.stringify({
        url: "https://drive.google.com/drive/folders/1234567890",
        link_type: "folder",
      }),
    );
  });

  it("should POST file data to /api/ee/gsheets/folder", async () => {
    setup({
      settingStatus: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const fileOption = await screen.findByText("Single Sheet");
    await userEvent.click(fileOption);

    const input = await screen.findByPlaceholderText(/https/i);
    await userEvent.type(
      input,
      "https://drive.google.com/drive/folders/1234567890",
    );

    const importButton = await screen.findByRole("button", {
      name: /import file/i,
    });
    await userEvent.click(importButton);

    await waitFor(async () => {
      const post = fetchMock.calls("path:/api/ee/gsheets/folder");
      expect(post.length).toBe(1);
    });

    const post = fetchMock.calls("path:/api/ee/gsheets/folder");
    const postBody = await post?.[0]?.[1]?.body;
    expect(postBody).toEqual(
      JSON.stringify({
        url: "https://drive.google.com/drive/folders/1234567890",
        link_type: "file",
      }),
    );
  });
});
