import userEvent from "@testing-library/user-event";
import { act } from "react-dom/test-utils";

import {
  findRequests,
  setupListPublicActionsEndpoint,
  setupListPublicCardsEndpoint,
  setupListPublicDashboardsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
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
  setupListPublicActionsEndpoint();
  setupListPublicCardsEndpoint();
  setupListPublicDashboardsEndpoint();

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

    expect(screen.queryByText("Shared Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Action Forms")).not.toBeInTheDocument();
  });

  it("should render the PublicSharingSettingsPage with public sharing enabled", async () => {
    await act(() => setup(true));
    [
      "Enable Public Sharing",
      "Shared Dashboards",
      "Shared Questions",
      "Shared Action Forms",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should toggle public sharing", async () => {
    await setup(false);
    expect(screen.queryByText("Shared Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Action Forms")).not.toBeInTheDocument();

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
      const toast = screen.getByLabelText("check icon");
      expect(toast).toBeInTheDocument();
    });
  });
});
