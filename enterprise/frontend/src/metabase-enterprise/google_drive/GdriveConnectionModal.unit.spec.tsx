import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupGdriveGetFolderEndpoint,
  setupGdrivePostFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { GdrivePayload } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { GdriveConnectionModal } from "./GdriveConnectionModal";

const setup = ({
  status,
  isAdmin = true,
}: {
  status: GdrivePayload["status"];
  isAdmin?: boolean;
}) => {
  const settings = createMockSettings({
    "show-google-sheets-integration": true,
    "token-features": createMockTokenFeatures({
      attached_dwh: true,
    }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupGdrivePostFolderEndpoint();
  setupGdriveGetFolderEndpoint({
    status,
  });
  setupGdriveServiceAccountEndpoint(
    "super-service-account@testing.metabase.com",
  );

  return renderWithProviders(
    <GdriveConnectionModal onClose={() => {}} isModalOpen reconnect={false} />,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
        currentUser: createMockUser({ is_superuser: isAdmin }),
      },
    },
  );
};

describe("Google Drive > Connect / Disconnect modal", () => {
  it("should show disconnect modal if connected", async () => {
    setup({
      status: "active",
    });
    expect(await screen.findByText("Disconnect")).toBeInTheDocument();
  });

  it("should show connection modal if not connected", async () => {
    setup({
      status: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();
  });

  it("should show service account email", async () => {
    setup({
      status: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();
    expect(
      await screen.findByText("super-service-account@testing.metabase.com"),
    ).toBeInTheDocument();
  });

  it("should show 'import folder' button when folder is selected", async () => {
    setup({
      status: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const folderOption = await screen.findByText("Entire folder");
    await userEvent.click(folderOption);

    expect(await screen.findByText("Import folder")).toBeInTheDocument();
  });

  it("should show 'import file' button when file is selected", async () => {
    setup({
      status: "not-connected",
    });
    expect(await screen.findByText("Import Google Sheets")).toBeInTheDocument();

    const fileOption = await screen.findByText("Single Sheet");
    await userEvent.click(fileOption);

    expect(await screen.findByText("Import file")).toBeInTheDocument();
  });

  it("should POST folder data to /api/ee/gsheets/connection", async () => {
    setup({
      status: "not-connected",
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
      const posts = await findRequests("POST");
      expect(posts.length).toBe(1);
    });

    const [{ body: postBody }] = await findRequests("POST");
    expect(postBody).toEqual({
      link_type: "folder",
      url: "https://drive.google.com/drive/folders/1234567890",
    });
  });

  it("should POST file data to /api/ee/gsheets/connection", async () => {
    setup({
      status: "not-connected",
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
      const posts = await findRequests("POST");
      expect(posts.length).toBe(1);
    });

    const [{ body: postBody }] = await findRequests("POST");
    expect(postBody).toEqual({
      url: "https://drive.google.com/drive/folders/1234567890",
      link_type: "file",
    });
  });

  it("should not make any gdrive api requests for non-admins", async () => {
    await setup({
      status: "not-connected",
      isAdmin: false,
    });

    expect(screen.queryByText("Import Google Sheets")).not.toBeInTheDocument();

    const gets = await findRequests("GET");
    expect(gets.length).toBe(0);
  });
});
