import userEvent from "@testing-library/user-event";
import { act } from "react-dom/test-utils";

import {
  findRequests,
  setupListPublicActionsEndpoint,
  setupListPublicCardsEndpoint,
  setupListPublicDashboardsEndpoint,
  setupListPublicDocumentsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { PublicSharingSettingsPage } from "./PublicSharingSettingsPage";

const setup = async (enablePublicSharing = false) => {
  const publicSharingSettings = {
    "enable-public-sharing": enablePublicSharing,
  } as const;

  const settings = createMockSettings(publicSharingSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );
  setupListPublicActionsEndpoint([
    {
      id: 1,
      name: "Test Action",
      model_id: 1,
      public_uuid: "e4f2be29-78df-4c35-9cc4-98d04091ff13",
    },
  ]);
  setupListPublicCardsEndpoint([
    {
      name: "Test Question",
      id: 2,
      public_uuid: "11bf0e18-34d2-4630-865a-c0bebb75c8b3",
    },
  ]);
  setupListPublicDashboardsEndpoint([
    {
      name: "Test Dashboard",
      id: 3,
      public_uuid: "16a4568d-c328-4306-9c4b-ec8fbd6e4c8e",
    },
  ]);
  setupListPublicDocumentsEndpoint([
    {
      name: "Test Document",
      id: 4,
      public_uuid: "3a9a7c46-ff19-4935-bfbe-4932d315732a",
    },
  ]);

  renderWithProviders(
    <div>
      <PublicSharingSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("PublicSharingSettingsPage", () => {
  it("should render the PublicSharingSettingsPage with public sharing disabled", async () => {
    await act(() => setup(false));

    expect(screen.getByText("Enable Public Sharing")).toBeInTheDocument();

    [
      "Shared dashboards",
      "Shared questions",
      "Shared action forms",
      "Shared documents",
      "Test Action",
      "Test Dashboard",
      "Test Question",
      "Test Document",
    ].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  it("should render the PublicSharingSettingsPage with public sharing enabled", async () => {
    await act(() => setup(true));
    [
      "Enable Public Sharing",
      "Shared dashboards",
      "Shared questions",
      "Shared action forms",
      "Shared documents",
      "Test Action",
      "Test Dashboard",
      "Test Question",
      "Test Document",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should toggle public sharing", async () => {
    await setup(false);
    expect(screen.queryByText("Shared Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Action Forms")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Documents")).not.toBeInTheDocument();

    // Toggle public sharing on
    const toggle = await screen.findByRole("switch");
    await userEvent.click(toggle);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { url: putUrl, body: putBody } = puts[0];

    expect(putUrl).toContain("/api/setting/enable-public-sharing");
    expect(putBody).toEqual({ value: true });

    // Should show success toast
    await waitFor(() => {
      const toast = screen.getByLabelText("check_filled icon");
      expect(toast).toBeInTheDocument();
    });
  });
});
